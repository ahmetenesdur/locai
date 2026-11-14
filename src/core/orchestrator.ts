import rateLimiter, { ProviderStatus, RateLimiterConfig } from "../utils/rate-limiter.js";
import pLimit from "p-limit";
import ProgressTracker, { ProgressOptions } from "../utils/progress-tracker.js";
import QualityChecker from "../utils/quality/index.js";
import type { QualityRules } from "../utils/quality/base-checker.js";
import type { LengthControlOptions } from "../utils/quality/length-checker.js";
import type { StyleGuideConfig } from "../utils/quality/style-guide-checker.js";
import ContextProcessor, { AnalysisResult, ContextConfig } from "./context-processor.js";
import { LRUCache } from "lru-cache";
import os from "os";
import gracefulShutdown from "../utils/graceful-shutdown.js";

import GlossaryManager, { GlossaryConfig } from "../utils/glossary-manager.js";
import type { FlatTranslationValue } from "../utils/object-transformer.js";
import type { RetryConfig } from "../utils/retry-helper.js";
import type { ProviderConfig } from "../providers/base-provider.js";
import fs from "fs";
import path from "path";
import { log } from "../utils/logger.js";

// Pipeline imports
import Pipeline from "./pipeline/Pipeline.js";
import {
	createTranslationContext,
	TranslationMeta,
	TranslationResult,
} from "./pipeline/context.js";
import InputValidationStep from "./pipeline/steps/InputValidationStep.js";
import CacheReadStep, { CacheStats } from "./pipeline/steps/CacheReadStep.js";
import GlossaryPreStep from "./pipeline/steps/GlossaryPreStep.js";
import TranslationStep, {
	ConfidenceSettings,
	ReviewQueueItem,
} from "./pipeline/steps/TranslationStep.js";
import GlossaryPostStep from "./pipeline/steps/GlossaryPostStep.js";
import QualityCheckStep from "./pipeline/steps/QualityCheckStep.js";
import ToneCheckStep from "./pipeline/steps/ToneCheckStep.js";
import ConfidenceCheckStep from "./pipeline/steps/ConfidenceCheckStep.js";
import CacheWriteStep from "./pipeline/steps/CacheWriteStep.js";
import ContextEnrichmentStep from "./pipeline/steps/ContextEnrichmentStep.js";
import { SourceCodeAnalyzer } from "../services/source-analyzer.js";

/** The `rateLimiter` configuration section. */
export interface RateLimiterOptions extends RateLimiterConfig {
	enabled?: boolean;
}

/** The `retryOptions` configuration section; providers read `maxRetries` and `initialDelay`. */
export interface ProviderRetryOptions {
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	jitter?: boolean;
	retryableErrors?: string[];
	perProviderRetry?: Record<string, Partial<RetryConfig>>;
}

/** The `vectorMemory` configuration section. */
export interface VectorMemoryOptions extends VectorStoreConfig {
	embeddingProvider?: string;
	embeddingModel?: string;
}

/**
 * Settings read by the orchestrator and its pipeline steps. The whole object is also
 * forwarded to the provider's `translate()` (see TranslationStep).
 */
export interface OrchestratorOptions {
	context: ContextConfig;
	/** Scan the project's source code for where each key is used (default true). */
	deepContext?: boolean;
	progressOptions?: ProgressOptions;
	styleGuide?: StyleGuideConfig;
	lengthControl?: LengthControlOptions;
	qualityChecks?: {
		enabled?: boolean;
		rules?: QualityRules;
		autoFix?: boolean;
	};
	advanced?: {
		timeoutMs?: number;
		maxKeyLength?: number;
		maxBatchSize?: number;
		autoOptimize?: boolean;
		debug?: boolean;
	};
	glossary?: GlossaryConfig;
	rateLimiter?: RateLimiterOptions;
	cacheSize?: number;
	cacheTTL?: number;
	updateAgeOnGet?: boolean;
	/** @deprecated Has no effect: expired cache entries are always translated again. */
	allowStaleCache?: boolean;
	/** @deprecated Has no effect: the cache never refreshes entries in the background. */
	staleWhileRevalidate?: boolean;
	minConfidence?: number;
	saveReviewQueue?: boolean;
	confidenceScoring?: {
		enabled?: boolean;
		minConfidence?: number;
		saveReviewQueue?: boolean;
		autoApproveThreshold?: number;
		reviewThreshold?: number;
		rejectThreshold?: number;
	};
	concurrencyLimit?: number;
	cacheEnabled?: boolean;
	/** Language of the source texts. */
	source: string;
	vectorMemory?: VectorMemoryOptions;
	/** Analyzer shared between orchestrators; a new one is created when omitted. */
	sourceCodeAnalyzer?: SourceCodeAnalyzer;

	// Provider selection (TranslationStep) and settings read by the providers
	/** Translation provider; the available providers are tried in order when unset. */
	apiProvider?: string;
	useFallback?: boolean;
	fallbackOrder?: string[];
	/** Model settings per provider, keyed by provider name. */
	apiConfig?: Record<string, ProviderConfig>;
	retryOptions?: ProviderRetryOptions;
}

// Vector Memory Imports
import { VectorStore, VectorStoreConfig } from "../services/vector-store.js";
import { EmbeddingProvider } from "../services/embedding-provider.js";
import { VectorCacheReadStep, VectorMemoryStats } from "./pipeline/steps/VectorCacheReadStep.js";
import { VectorCacheWriteStep } from "./pipeline/steps/VectorCacheWriteStep.js";

interface AdvancedSettings {
	timeoutMs: number;
	maxKeyLength: number;
	maxBatchSize: number;
	autoOptimize: boolean;
	debug: boolean;
}

/** One key to translate, as passed to {@link Orchestrator.processTranslations}. */
interface TranslationItem {
	key: string;
	text: string;
	targetLang: string;
	existingTranslation?: FlatTranslationValue;
}

/** Cache counters plus the cache's current size, capacity and hit rate. */
export interface CacheStatus extends CacheStats {
	size: number;
	capacity: number;
	hitRate: number;
}

/** Snapshot returned by {@link Orchestrator.getStatus}. */
export interface OrchestratorStatus {
	/** Empty when the cache is disabled. */
	cache: CacheStatus | Record<string, never>;
	rateLimiter: Record<string, ProviderStatus>;
	concurrency: number;
	advanced: AdvancedSettings;
	confidence: {
		minThreshold?: number;
		autoApproveThreshold: number;
		reviewThreshold: number;
		rejectThreshold: number;
		reviewQueueSize: number;
		autoApprovedCount: number;
		rejectedCount: number;
	} | null;
}

class Orchestrator {
	private options: OrchestratorOptions;
	private contextProcessor: ContextProcessor;

	public progress: ProgressTracker;
	public qualityChecker: QualityChecker | null;
	public advanced: AdvancedSettings;
	public glossaryManager: GlossaryManager;
	public translationCache: LRUCache<string, TranslationResult> | null;
	public cacheStats: CacheStats;

	// Vector Memory
	public vectorStore: VectorStore;
	public embeddingProvider: EmbeddingProvider;
	public vectorStats: VectorMemoryStats;

	// Source Code Analysis
	public sourceAnalyzer: SourceCodeAnalyzer;

	public confidenceSettings: ConfidenceSettings;
	private concurrencyLimit: number;
	private pipeline: Pipeline;
	private _shutdownCallback: (() => Promise<void>) | null;

	constructor(options: OrchestratorOptions) {
		this.options = options;
		this.contextProcessor = new ContextProcessor(options.context || {});

		// Allow progress tracker to be configured via options
		this.progress = new ProgressTracker(options.progressOptions || {});

		this.qualityChecker = new QualityChecker({
			styleGuide: options.styleGuide,
			context: options.context,
			lengthControl: options.lengthControl,
			...(options.qualityChecks?.rules || {}),
			enabled: options.qualityChecks?.enabled,
		});

		this.advanced = {
			timeoutMs: options.advanced?.timeoutMs || 30000,
			maxKeyLength: options.advanced?.maxKeyLength || 10000,
			maxBatchSize: options.advanced?.maxBatchSize || 50,
			autoOptimize: options.advanced?.autoOptimize !== false,
			debug: options.advanced?.debug || process.env.DEBUG === "true" || false,
		};

		// Initialize glossary manager
		this.glossaryManager = new GlossaryManager(options.glossary || {});
		if (this.glossaryManager.enabled && this.advanced.debug) {
			const stats = this.glossaryManager.getStats();
			log(`Glossary enabled: ${stats.totalTerms} terms loaded`, true);
		}

		if (options.rateLimiter) {
			rateLimiter.updateConfig({
				queueStrategy: options.rateLimiter.queueStrategy,
				queueTimeout: options.rateLimiter.queueTimeout,
				adaptiveThrottling: options.rateLimiter.adaptiveThrottling,
				providerLimits: options.rateLimiter.providerLimits,
			});
		}

		// Cache Initialization
		this.translationCache = new LRUCache<string, TranslationResult>({
			max: options.cacheSize || 1000,
			ttl: options.cacheTTL || 1000 * 60 * 60 * 24,
			updateAgeOnGet: options.updateAgeOnGet !== false,
		});

		this.cacheStats = {
			hits: 0,
			misses: 0,
			stored: 0,
		};

		// Confidence scoring settings
		this.confidenceSettings = {
			enabled:
				options.minConfidence !== undefined ||
				options.saveReviewQueue ||
				options.confidenceScoring?.enabled ||
				false,
			autoApproveThreshold: options.confidenceScoring?.autoApproveThreshold || 0.9,
			reviewThreshold: options.confidenceScoring?.reviewThreshold || 0.7,
			rejectThreshold: options.confidenceScoring?.rejectThreshold || 0.5,
			saveReviewQueue:
				options.saveReviewQueue || options.confidenceScoring?.saveReviewQueue || false,
			reviewQueue: [],
			autoApprovedCount: 0,
			rejectedCount: 0,
		};

		// Use minConfidence from options if present as specific threshold logic override or mapping
		if (options.minConfidence) {
			// This logic was slightly fuzzy in JS, preserved here:
			// If minConfidence is set, it might override others or act as a floor.
			// The original code used it.
		}

		this.concurrencyLimit = options.concurrencyLimit || 5;

		if (this.advanced.autoOptimize) {
			this._applyAutoOptimizations();
		}

		// Vector Memory Initialization
		this.vectorStore = new VectorStore(
			options.vectorMemory || {
				enabled: false,
				vectorDbPath: "./.localize-cache/vector-memory",
			}
		);
		this.embeddingProvider = new EmbeddingProvider({
			provider: options.vectorMemory?.embeddingProvider,
			model: options.vectorMemory?.embeddingModel,
		});

		this.vectorStats = {
			hits: 0,
			contextUsed: 0,
			misses: 0,
		};

		// Initialize vector store (non-blocking)
		if (options.vectorMemory?.enabled) {
			this.vectorStore.initialize().catch((err) => {
				if (this.advanced.debug) {
					console.warn("Vector store initialization failed:", err.message);
				}
			});
		}

		// Initialize Source Analyzer
		if (options.sourceCodeAnalyzer) {
			this.sourceAnalyzer = options.sourceCodeAnalyzer;
			// Assumed initialized or self-initializing
		} else {
			this.sourceAnalyzer = new SourceCodeAnalyzer();
			// Fire and forget initialization (or await if strict)
			// We'll trust it catches up or is fast enough for the first few items,
			// or we can await it if we want to block startup.
			// For CLI responsiveness, we might want to await it only if deep context is enabled.
			const deepContextEnabled = options.deepContext !== false; // Enabled by default
			if (deepContextEnabled) {
				this.sourceAnalyzer.initialize().catch((err) => {
					if (this.advanced.debug) {
						console.warn("Source analyzer init failed:", err.message);
					}
				});
			}
		}

		// Initialize Pipeline
		this.pipeline = new Pipeline();
		this._buildPipeline();

		this._shutdownCallback = async () => {
			if (this.translationCache && this.translationCache.size > 0) {
				console.log(`Flushing ${this.translationCache.size} cache entries...`);
				this.translationCache.clear();
			}
			this.resetCacheStats();
		};
		gracefulShutdown.registerCallback(this._shutdownCallback);

		if (this.advanced.debug) {
			log("Orchestrator initialized with options:", true);
			// ...
		}
	}

	private _buildPipeline(): void {
		// 1. Validation
		this.pipeline.use(new InputValidationStep(this.advanced.maxKeyLength));

		// 2. Cache Read
		if (this.translationCache) {
			this.pipeline.use(
				new CacheReadStep(this.translationCache, this.cacheStats, {
					enabled: this.options.cacheEnabled,
				})
			);
		}

		// 2.5 Vector Cache Read
		if (this.options.vectorMemory?.enabled) {
			this.pipeline.use(
				new VectorCacheReadStep(
					this.vectorStore,
					this.embeddingProvider,
					this.vectorStats,
					this.options.vectorMemory
				)
			);
		}

		// 3. Glossary Pre-processing
		this.pipeline.use(new GlossaryPreStep(this.glossaryManager));

		// 4. Translation
		// 3.5 Context Enrichment (Deep Context)
		const deepContextEnabled = this.options.deepContext !== false;
		this.pipeline.use(new ContextEnrichmentStep(this.sourceAnalyzer, deepContextEnabled));

		this.pipeline.use(new TranslationStep(this.options, this.confidenceSettings));

		// 4.5 Vector Cache Write (save new translations)
		if (this.options.vectorMemory?.enabled) {
			this.pipeline.use(
				new VectorCacheWriteStep(
					this.vectorStore,
					this.embeddingProvider,
					this.options.vectorMemory
				)
			);
		}

		// 5. Glossary Post-processing
		this.pipeline.use(new GlossaryPostStep(this.glossaryManager));

		// 6. Quality Check & JSON Validation
		this.pipeline.use(new QualityCheckStep(this.qualityChecker, this.advanced.debug));

		// 6.5. Tone Verification (New)
		this.pipeline.use(
			new ToneCheckStep({
				enabled: this.options.styleGuide?.enforceTone,
				debug: this.advanced.debug,
			})
		);

		// 7. Confidence Score Calculationk
		this.pipeline.use(new ConfidenceCheckStep(this.confidenceSettings, this.advanced.debug));

		// 8. Cache Write
		if (this.translationCache) {
			this.pipeline.use(
				new CacheWriteStep(this.translationCache, this.cacheStats, {
					enabled: this.options.cacheEnabled,
				})
			);
		}
	}

	async processTranslation(
		key: string,
		text: string,
		targetLang: string,
		contextData: TranslationMeta,
		existingTranslation?: FlatTranslationValue
	): Promise<TranslationResult> {
		const context = createTranslationContext(
			key,
			text,
			this.options.source,
			targetLang,
			this.options,
			contextData,
			existingTranslation
		);

		await this.pipeline.execute(context);

		return context.result;
	}

	async processTranslations(items: TranslationItem[]): Promise<TranslationResult[]> {
		this.progress.start(items.length, items[0].targetLang);

		const limit = pLimit(this.concurrencyLimit);
		const contextBatchSize = this.advanced.maxBatchSize;
		const chunks = this._chunkArray(items, contextBatchSize);

		if (this.advanced.debug) {
			log(
				`Processing ${items.length} items with concurrency limit ${this.concurrencyLimit}`,
				true
			);
		}

		const allPromises: Promise<TranslationResult>[] = [];

		for (const chunk of chunks) {
			const texts = chunk.map((item) => item.text);
			let contextResults: AnalysisResult[] = [];

			try {
				contextResults = await this.contextProcessor.analyzeBatch(texts);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`Context analysis failed for batch: ${message}`);
			}

			for (let i = 0; i < chunk.length; i++) {
				const item = chunk[i];
				const contextData =
					contextResults[i] || (await this.contextProcessor.analyze(item.text));

				const promise = limit(async (): Promise<TranslationResult> => {
					try {
						const result = await this.processTranslation(
							item.key,
							item.text,
							item.targetLang,
							contextData,
							item.existingTranslation
						);

						this.progress.increment(result.success ? "success" : "failed");
						return result;
					} catch (error) {
						this.progress.increment("failed");
						return {
							key: item.key,
							translated: item.text,
							error: error instanceof Error ? error.message : String(error),
							success: false,
							context: {},
						};
					}
				});

				allPromises.push(promise);
			}
		}

		const processedResults = await Promise.all(allPromises);
		return processedResults;
	}

	// Helper methods
	private _chunkArray<T>(array: T[], chunkSize: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}

	private _applyAutoOptimizations(): void {
		try {
			const cpuCount = os.cpus().length;
			const totalMemory = os.totalmem();
			const memoryGB = Math.floor(totalMemory / (1024 * 1024 * 1024));

			if (memoryGB >= 8 && cpuCount >= 4) {
				this.concurrencyLimit = Math.min(20, cpuCount * 2);
			} else if (memoryGB >= 4 && cpuCount >= 2) {
				this.concurrencyLimit = Math.min(10, cpuCount * 2);
			} else {
				this.concurrencyLimit = 4;
			}

			if (this.advanced.debug) {
				log(
					`Auto-optimized settings - CPU: ${cpuCount}, Memory: ${memoryGB}GB, Concurrency: ${this.concurrencyLimit}`,
					true
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn("Failed to auto-optimize settings:", message);
		}
	}

	clearCache(): void {
		if (this.translationCache) {
			this.translationCache.clear();
		}
		this.resetCacheStats();
	}

	resetCacheStats(): void {
		this.cacheStats = {
			hits: 0,
			misses: 0,
			stored: 0,
		};
	}

	getCacheStats(): CacheStatus | Record<string, never> {
		if (!this.translationCache) return {};
		return {
			...this.cacheStats,
			size: this.translationCache.size,
			capacity: this.translationCache.max,
			hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
		};
	}

	getStatus(): OrchestratorStatus {
		return {
			cache: this.getCacheStats(),
			rateLimiter: rateLimiter.getStatus(),
			concurrency: this.concurrencyLimit,
			advanced: this.advanced,
			confidence: this.confidenceSettings.enabled
				? {
						minThreshold: this.options.minConfidence,
						autoApproveThreshold: this.confidenceSettings.autoApproveThreshold,
						reviewThreshold: this.confidenceSettings.reviewThreshold,
						rejectThreshold: this.confidenceSettings.rejectThreshold,
						reviewQueueSize: this.confidenceSettings.reviewQueue.length,
						autoApprovedCount: this.confidenceSettings.autoApprovedCount,
						rejectedCount: this.confidenceSettings.rejectedCount,
					}
				: null,
		};
	}

	saveReviewQueue(): void {
		if (
			!this.confidenceSettings.saveReviewQueue ||
			this.confidenceSettings.reviewQueue.length === 0
		) {
			return;
		}

		try {
			const cacheDir = path.join(process.cwd(), ".localize-cache");
			if (!fs.existsSync(cacheDir)) {
				fs.mkdirSync(cacheDir, { recursive: true });
			}

			const reviewFile = path.join(cacheDir, "review-queue.json");
			const data = {
				timestamp: new Date().toISOString(),
				minConfidence: this.options.minConfidence,
				items: this.confidenceSettings.reviewQueue,
				stats: {
					total: this.confidenceSettings.reviewQueue.length,
					byLanguage: this._groupByLanguage(this.confidenceSettings.reviewQueue),
					byConfidenceLevel: this._groupByConfidenceLevel(
						this.confidenceSettings.reviewQueue
					),
				},
			};

			fs.writeFileSync(reviewFile, JSON.stringify(data, null, 2));
			console.log(
				`\nReview queue saved: ${this.confidenceSettings.reviewQueue.length} items need review`
			);
			console.log(`   File: ${reviewFile}`);
			console.log(`   Run 'localize review' to start interactive review\n`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Warning: Failed to save review queue: ${message}`);
		}
	}

	private _groupByLanguage(items: ReviewQueueItem[]): Record<string, number> {
		const grouped: Record<string, number> = {};
		items.forEach((item) => {
			if (!grouped[item.language]) {
				grouped[item.language] = 0;
			}
			grouped[item.language]++;
		});
		return grouped;
	}

	private _groupByConfidenceLevel(items: ReviewQueueItem[]): Record<string, number> {
		const grouped: Record<string, number> = { high: 0, medium: 0, low: 0, very_low: 0 };
		items.forEach((item) => {
			if (grouped[item.confidence.level] !== undefined) {
				grouped[item.confidence.level]++;
			}
		});
		return grouped;
	}

	destroy(): void {
		if (this.translationCache) {
			this.translationCache.clear();
		}

		this.resetCacheStats();

		if (this._shutdownCallback) {
			gracefulShutdown.unregisterCallback(this._shutdownCallback);
			this._shutdownCallback = null;
		}

		this.translationCache = null;
		// @ts-expect-error allowing null for cleanup
		this.contextProcessor = null;
		// @ts-expect-error allowing null for cleanup
		this.progress = null;
		this.qualityChecker = null;
		// @ts-expect-error allowing null for cleanup
		this.glossaryManager = null;
		// @ts-expect-error allowing null for cleanup
		this.pipeline = null;
	}
}

export default Orchestrator;
