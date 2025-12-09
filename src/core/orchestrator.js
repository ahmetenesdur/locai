import rateLimiter from "../utils/rate-limiter.js";
import pLimit from "p-limit";
import ProviderFactory from "./provider-factory.js";
import ProgressTracker from "../utils/progress-tracker.js";
import QualityChecker from "../utils/quality/index.js";
import ContextProcessor from "./context-processor.js";
import { LRUCache } from "lru-cache";
import crypto from "crypto";
import os from "os";
import gracefulShutdown from "../utils/graceful-shutdown.js";

import GlossaryManager from "../utils/glossary-manager.js";
import { FileManager } from "../utils/file-manager.js";
import fs from "fs";
import path from "path";
import { log } from "../utils/logger.js";

/**
 * Orchestrator class manages the end-to-end translation process.
 * It coordinates context analysis, translation providers, quality checks,
 * glossary management, and caching.
 */
class Orchestrator {
	/**
	 * Create a new Orchestrator instance.
	 * @param {Object} options - Configuration options.
	 * @param {Object} [options.context] - Context analysis configuration.
	 * @param {Object} [options.progressOptions] - Progress tracking configuration.
	 * @param {Object} [options.styleGuide] - Style guide rules.
	 * @param {Object} [options.lengthControl] - Length control settings.
	 * @param {Object} [options.advanced] - Advanced settings (timeout, batch size, etc.).
	 * @param {Object} [options.glossary] - Glossary configuration.
	 * @param {Object} [options.rateLimiter] - Rate limiter configuration.
	 * @param {number} [options.cacheSize] - Maximum number of items in cache.
	 * @param {number} [options.cacheTTL] - Cache time-to-live in milliseconds.
	 * @param {boolean} [options.updateAgeOnGet] - Whether to update cache item age on retrieval.
	 * @param {boolean} [options.allowStaleCache] - Whether to allow serving stale cache items.
	 * @param {boolean} [options.staleWhileRevalidate] - Whether to revalidate stale items in background.
	 * @param {number} [options.minConfidence] - Minimum confidence score for auto-approval.
	 * @param {boolean} [options.saveReviewQueue] - Whether to save low-confidence translations for review.
	 * @param {Object} [options.confidenceScoring] - Detailed confidence scoring settings.
	 * @param {number} [options.concurrencyLimit] - Maximum concurrent translation requests.
	 * @param {string} [options.apiProvider] - Name of the AI provider to use.
	 * @param {boolean} [options.useFallback] - Whether to use fallback providers on failure.
	 * @param {string} options.source - Source language code.
	 */
	constructor(options) {
		this.options = options;
		this.contextProcessor = new ContextProcessor(options.context);

		// Allow progress tracker to be configured via options
		this.progress = new ProgressTracker(options.progressOptions || {});

		this.qualityChecker = new QualityChecker({
			styleGuide: options.styleGuide,
			context: options.context,
			lengthControl: options.lengthControl,
		});

		this.advanced = {
			timeoutMs: options.advanced?.timeoutMs || 30000,
			maxKeyLength: options.advanced?.maxKeyLength || 10000,
			maxBatchSize: options.advanced?.maxBatchSize || 50,
			autoOptimize: options.advanced?.autoOptimize !== false,
			debug: options.advanced?.debug || false,
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

		this.translationCache = new LRUCache({
			max: options.cacheSize || 1000,
			ttl: options.cacheTTL || 1000 * 60 * 60 * 24,
			updateAgeOnGet: options.updateAgeOnGet !== false,
			allowStale: options.allowStaleCache !== false,
			fetchMethod: async (key, staleValue, { context }) => {
				if (staleValue && options.staleWhileRevalidate !== false) {
					this._refreshCacheEntry(key, context).catch((err) => {
						console.warn(`Cache refresh failed for key ${key}: ${err.message}`);
					});
					return staleValue;
				}
				return null;
			},
		});

		this.cacheStats = {
			hits: 0,
			misses: 0,
			staleHits: 0,
			stored: 0,
			refreshes: 0,
		};

		// Confidence scoring settings
		this.confidenceSettings = {
			enabled:
				options.minConfidence !== undefined ||
				options.saveReviewQueue ||
				options.confidenceScoring?.enabled,
			minConfidence: options.minConfidence || options.confidenceScoring?.minConfidence || 0.0,
			saveReviewQueue:
				options.saveReviewQueue || options.confidenceScoring?.saveReviewQueue || false,
			autoApproveThreshold: options.confidenceScoring?.autoApproveThreshold || 0.9,
			reviewThreshold: options.confidenceScoring?.reviewThreshold || 0.7,
			rejectThreshold: options.confidenceScoring?.rejectThreshold || 0.5,
			reviewQueue: [],
			autoApprovedCount: 0,
			rejectedCount: 0,
		};

		this.concurrencyLimit = options.concurrencyLimit || 5;

		if (this.advanced.autoOptimize) {
			this._applyAutoOptimizations();
		}

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
			log(
				JSON.stringify(
					{
						concurrencyLimit: this.concurrencyLimit,
						cacheEnabled: options.cacheEnabled !== false,
						cacheSize: options.cacheSize || 1000,
						cacheTTL: options.cacheTTL || 1000 * 60 * 60 * 24,
						rateLimiter: rateLimiter.getConfig(),
						advanced: this.advanced,
					},
					null,
					2
				),
				true
			);
		}
	}

	/**
	 * Process a single translation key.
	 * @param {string} key - The translation key.
	 * @param {string} text - The source text to translate.
	 * @param {string} targetLang - The target language code.
	 * @param {Object} [contextData] - Context data for the translation.
	 * @param {string} [existingTranslation] - Existing translation (if any) to guide improvement.
	 * @returns {Promise<Object>} - The translation result object.
	 */
	async processTranslation(key, text, targetLang, contextData, existingTranslation) {
		if (typeof text !== "string") return { key, translated: text, error: "Invalid input type" };

		if (key.length > this.advanced.maxKeyLength) {
			return {
				key: key.substring(0, 100) + "...",
				translated: text,
				error: `Key exceeds maximum length of ${this.advanced.maxKeyLength} characters`,
				success: false,
			};
		}

		// 1. Check Cache
		const cacheResult = this._checkCache(key, text, targetLang, contextData);
		if (cacheResult) return cacheResult;

		this.cacheStats.misses++;

		try {
			// 2. Get Provider
			const provider = this._getProvider();

			// 3. Protect Terms
			const { protectedText, termMap } = this.glossaryManager.protectTerms(
				text,
				this.options.source,
				targetLang
			);

			// 4. Translate
			const translationResult = await this._executeTranslation(
				provider,
				protectedText,
				targetLang,
				contextData,
				existingTranslation
			);
			let translated = translationResult.translated;
			const confidence = translationResult.confidence;

			// 5. Restore Terms
			translated = this.glossaryManager.restoreTerms(translated, termMap);

			// 6. Quality Checks & Fixes
			const qualityResult = this.qualityChecker.validateAndFix(text, translated);
			translated = qualityResult.fixedText;

			// 7. JSON Validation
			translated = this._ensureJsonValidity(key, translated);

			// 8. Construct Result
			const result = {
				key,
				translated,
				context: contextData,
				success: true,
				qualityChecks: qualityResult,
			};

			// 9. Handle Confidence & Review
			if (confidence) {
				this._applyConfidenceRules(
					result,
					confidence,
					key,
					text,
					translated,
					targetLang,
					contextData
				);
			}

			// 10. Store in Cache
			this._cacheResult(key, text, targetLang, contextData, result);

			return result;
		} catch (err) {
			console.error(`Translation error - key "${key}":`, err);
			return {
				key,
				translated: text,
				error: err.message,
				success: false,
			};
		}
	}

	_checkCache(key, text, targetLang, contextData) {
		if (this.options.cacheEnabled === false) return null;

		const cacheKey = this._generateCacheKey(text, targetLang, contextData?.category);
		if (!this.translationCache?.has?.(cacheKey)) return null;

		const cachedResult = this.translationCache.get(cacheKey);

		if (!cachedResult || typeof cachedResult !== "object") {
			this.translationCache.delete(cacheKey);
			return null;
		}

		this.cacheStats.hits++;
		try {
			const ttl = this.translationCache.getRemainingTTL?.(cacheKey);
			if (typeof ttl === "number" && ttl <= 0) {
				this.cacheStats.staleHits++;
			}
		} catch (_error) {
			// Ignore cache errors
		}

		return {
			...cachedResult,
			key,
			fromCache: true,
		};
	}

	_getProvider() {
		const provider = ProviderFactory.getProvider(
			this.options?.apiProvider,
			this.options?.useFallback !== false,
			this.options
		);

		if (!provider || typeof provider.translate !== "function") {
			throw new Error(
				`Translation provider not available or invalid: ${this.options?.apiProvider || "unknown"}`
			);
		}
		return provider;
	}

	async _executeTranslation(
		provider,
		protectedText,
		targetLang,
		contextData,
		existingTranslation
	) {
		const translationContext = {
			...contextData,
			existingTranslation: existingTranslation || null,
		};

		// If confidence scoring is enabled, use extended method
		if (
			this.confidenceSettings.enabled &&
			typeof provider.extractTranslationWithConfidence === "function"
		) {
			const rawResponse = await provider.translate(
				protectedText,
				this.options.source,
				targetLang,
				{
					...this.options,
					detectedContext: translationContext,
					returnRawResponse: true,
				}
			);

			const result = provider.extractTranslationWithConfidence(
				rawResponse,
				provider.name,
				protectedText,
				this.options.source,
				targetLang,
				contextData?.category
			);

			return { translated: result.translation, confidence: result.confidence };
		}

		// Standard translation without confidence
		const translated = await provider.translate(
			protectedText,
			this.options.source,
			targetLang,
			{
				...this.options,
				detectedContext: translationContext,
			}
		);

		return { translated, confidence: null };
	}

	_ensureJsonValidity(key, translated) {
		const jsonValidation = FileManager.validateTranslationValue(key, translated);
		if (!jsonValidation.valid) {
			if (this.advanced.debug || process.env.DEBUG) {
				console.warn(`JSON validation warning for key "${key}": ${jsonValidation.error}`);
			}
			// Try to fix by escaping quotes if that's the issue
			const recheck = this.quoteBalanceChecker?.fixQuoteBalance(translated);
			if (recheck && recheck.text !== translated) {
				if (this.advanced.debug || process.env.DEBUG) {
					log(`Applied quote balance fix for key "${key}"`, true);
				}
				return recheck.text;
			}
		}
		return translated;
	}

	_applyConfidenceRules(result, confidence, key, text, translated, targetLang, contextData) {
		result.confidence = confidence;

		if (!this.confidenceSettings.enabled) return;

		// Auto-approve if above threshold
		if (confidence.score >= this.confidenceSettings.autoApproveThreshold) {
			result.autoApproved = true;
			this.confidenceSettings.autoApprovedCount++;

			if (this.advanced.debug) {
				log(`Auto-approved: ${key} (score: ${confidence.score.toFixed(3)})`, true);
			}
		}
		// Auto-reject if below threshold
		else if (confidence.score < this.confidenceSettings.rejectThreshold) {
			result.rejected = true;
			result.rejectionReason = `Quality score too low: ${confidence.score.toFixed(3)}`;
			this.confidenceSettings.rejectedCount++;

			if (this.advanced.debug) {
				log(`Auto-rejected: ${key} (score: ${confidence.score.toFixed(3)})`, true);
			}

			// Keep original text for rejected translations
			result.translated = text;
		}
		// Add to review queue if below review threshold
		else if (
			this.confidenceSettings.saveReviewQueue &&
			confidence.score < this.confidenceSettings.reviewThreshold
		) {
			result.needsReview = true;

			this.confidenceSettings.reviewQueue.push({
				key,
				source: text,
				translation: translated,
				confidence,
				language: targetLang,
				sourceLang: this.options.source,
				category: contextData?.category || "general",
				timestamp: new Date().toISOString(),
			});
		}
	}

	_cacheResult(key, text, targetLang, contextData, result) {
		if (this.options.cacheEnabled === false) return;

		const cacheKey = this._generateCacheKey(text, targetLang, contextData?.category);
		this.translationCache.set(cacheKey, result, {
			context: {
				text,
				targetLang,
				contextData,
			},
		});
		this.cacheStats.stored++;
	}

	/**
	 * Process a batch of translation items.
	 * Uses optimized concurrency (p-limit) and batch context analysis.
	 * @param {Array<{key: string, text: string, targetLang: string, existingTranslation?: string}>} items - Items to translate.
	 * @returns {Promise<Array<Object>>} - Array of translation results.
	 */
	async processTranslations(items) {
		this.progress.start(items.length, items[0].targetLang);

		// Use p-limit for concurrency control
		const limit = pLimit(this.concurrencyLimit);

		// Batch size for context analysis (not translation concurrency)
		// We process context in chunks to be efficient with AI calls if needed,
		// but then feed the translation tasks into the p-limit queue individually.
		const contextBatchSize = this.advanced.maxBatchSize;
		const chunks = this._chunkArray(items, contextBatchSize);

		if (this.advanced.debug) {
			log(
				`Processing ${items.length} items with concurrency limit ${this.concurrencyLimit}`,
				true
			);
		}

		console.log(""); // Empty line for progress bar

		// We will collect all promises here
		const allPromises = [];

		for (const chunk of chunks) {
			// 1. Analyze context for this batch first
			const texts = chunk.map((item) => item.text);
			let contextResults = [];

			try {
				contextResults = await this.contextProcessor.analyzeBatch(texts);
			} catch (error) {
				console.warn(`Context analysis failed for batch: ${error.message}`);
				// Fallback will be handled inside the loop if context is missing
			}

			// 2. Queue translations for this batch using p-limit
			for (let i = 0; i < chunk.length; i++) {
				const item = chunk[i];
				const contextData =
					contextResults[i] || (await this.contextProcessor.analyze(item.text));

				// Add to the limit queue
				const promise = limit(async () => {
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
							error: error.message,
							success: false,
						};
					}
				});

				allPromises.push(promise);
			}
		}

		// 3. Wait for all tasks to complete
		const processedResults = await Promise.all(allPromises);
		return processedResults;
	}

	_chunkArray(array, chunkSize) {
		const chunks = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}

	_applyAutoOptimizations() {
		try {
			const cpuCount = os.cpus().length;
			const totalMemory = os.totalmem();
			const memoryGB = Math.floor(totalMemory / (1024 * 1024 * 1024));

			// Higher concurrency allowed thanks to p-limit's efficient management
			if (memoryGB >= 8 && cpuCount >= 4) {
				this.concurrencyLimit = Math.min(20, cpuCount * 2); // Increased limits
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
			console.warn("Failed to auto-optimize settings:", error.message);
		}
	}

	clearCache() {
		this.translationCache.clear();
		this.resetCacheStats();
	}

	resetCacheStats() {
		this.cacheStats = {
			hits: 0,
			misses: 0,
			staleHits: 0,
			stored: 0,
			refreshes: 0,
		};
	}

	getCacheStats() {
		return {
			...this.cacheStats,
			size: this.translationCache.size,
			capacity: this.translationCache.max,
			hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
		};
	}

	/**
	 * Generate cache key using SHA-256 with smart sampling
	 */
	_generateCacheKey(text, targetLang, category = "unknown") {
		let keyContent;

		if (text.length <= 100) {
			// Short text: use as-is (lowercased for consistency)
			keyContent = `${targetLang}:${category}:${text.toLowerCase()}`;
		} else if (text.length <= 500) {
			// Medium text: sample from beginning, middle, and end
			const start = text.substring(0, 40).toLowerCase();
			const middlePos = Math.floor(text.length / 2);
			const middle = text.substring(middlePos - 20, middlePos + 20).toLowerCase();
			const end = text.substring(text.length - 40).toLowerCase();
			keyContent = `${targetLang}:${category}:${start}|MID:${middle}|${end}`;
		} else {
			// Long text: enhanced sampling
			const quarter = Math.floor(text.length / 4);
			const start = text.substring(0, 30).toLowerCase();
			const q1 = text.substring(quarter, quarter + 25).toLowerCase();
			const q2 = text.substring(quarter * 2, quarter * 2 + 25).toLowerCase();
			const q3 = text.substring(quarter * 3, quarter * 3 + 25).toLowerCase();
			const end = text.substring(text.length - 30).toLowerCase();
			keyContent = `${targetLang}:${category}:LEN:${text.length}|${start}|Q1:${q1}|Q2:${q2}|Q3:${q3}|${end}`;
		}

		return crypto
			.createHash("sha256")
			.update(keyContent, "utf8")
			.digest("hex")
			.substring(0, 32);
	}

	async _refreshCacheEntry(key, context) {
		if (!context || !context.text || !context.targetLang) {
			return;
		}

		try {
			const provider = ProviderFactory.getProvider(
				this.options.apiProvider,
				this.options.useFallback !== false,
				this.options
			);

			const translated = await provider.translate(
				context.text,
				this.options.source,
				context.targetLang,
				{
					...this.options,
					detectedContext: context.contextData,
				}
			);

			// Get current entry to update only the translation
			const currentEntry = this.translationCache.get(key);
			if (currentEntry) {
				const qualityResult = this.qualityChecker.validateAndFix(context.text, translated);

				this.translationCache.set(
					key,
					{
						...currentEntry,
						translated: qualityResult.fixedText,
						qualityChecks: qualityResult,
						refreshed: new Date().toISOString(),
					},
					{ context }
				);

				this.cacheStats.refreshes++;
			}
		} catch (error) {
			console.warn(`Failed to refresh cache entry: ${error.message}`);
		}
	}

	getStatus() {
		return {
			cache: this.getCacheStats(),
			rateLimiter: rateLimiter.getStatus(),
			concurrency: this.concurrencyLimit,
			advanced: this.advanced,
			confidence: this.confidenceSettings.enabled
				? {
						minThreshold: this.confidenceSettings.minConfidence,
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

	/**
	 * Save review queue to file
	 */
	saveReviewQueue() {
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
				minConfidence: this.confidenceSettings.minConfidence,
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
			console.warn(`Warning: Failed to save review queue: ${error.message}`);
		}
	}

	_groupByLanguage(items) {
		const grouped = {};
		items.forEach((item) => {
			if (!grouped[item.language]) {
				grouped[item.language] = 0;
			}
			grouped[item.language]++;
		});
		return grouped;
	}

	_groupByConfidenceLevel(items) {
		const grouped = { high: 0, medium: 0, low: 0, very_low: 0 };
		items.forEach((item) => {
			grouped[item.confidence.level]++;
		});
		return grouped;
	}

	/**
	 * Cleanup method to prevent memory leaks
	 */
	destroy() {
		if (this.translationCache) {
			this.translationCache.clear();
		}

		this.resetCacheStats();

		if (this._shutdownCallback) {
			gracefulShutdown.unregisterCallback(this._shutdownCallback);
			this._shutdownCallback = null;
		}

		this.translationCache = null;
		this.contextProcessor = null;
		this.progress = null;
		this.qualityChecker = null;
		this.glossaryManager = null;
	}
}

export default Orchestrator;
