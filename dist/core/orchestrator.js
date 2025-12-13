import rateLimiter from "../utils/rate-limiter.js";
import pLimit from "p-limit";
import ProgressTracker from "../utils/progress-tracker.js";
import QualityChecker from "../utils/quality/index.js";
import ContextProcessor from "./context-processor.js";
import { LRUCache } from "lru-cache";
import os from "os";
import gracefulShutdown from "../utils/graceful-shutdown.js";
import GlossaryManager from "../utils/glossary-manager.js";
import fs from "fs";
import path from "path";
import { log } from "../utils/logger.js";
// Pipeline imports
import Pipeline from "./pipeline/Pipeline.js";
import { createTranslationContext, } from "./pipeline/context.js";
import InputValidationStep from "./pipeline/steps/InputValidationStep.js";
import CacheReadStep from "./pipeline/steps/CacheReadStep.js";
import GlossaryPreStep from "./pipeline/steps/GlossaryPreStep.js";
import TranslationStep from "./pipeline/steps/TranslationStep.js";
import GlossaryPostStep from "./pipeline/steps/GlossaryPostStep.js";
import QualityCheckStep from "./pipeline/steps/QualityCheckStep.js";
import ConfidenceCheckStep from "./pipeline/steps/ConfidenceCheckStep.js";
import CacheWriteStep from "./pipeline/steps/CacheWriteStep.js";
/**
 * Orchestrator class manages the end-to-end translation process using a Pipeline pattern.
 */
class Orchestrator {
    options;
    contextProcessor;
    progress;
    qualityChecker;
    advanced;
    glossaryManager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    translationCache;
    cacheStats;
    confidenceSettings;
    concurrencyLimit;
    pipeline;
    _shutdownCallback;
    constructor(options) {
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
        // Cache Initialization
        this.translationCache = new LRUCache({
            max: options.cacheSize || 1000,
            ttl: options.cacheTTL || 1000 * 60 * 60 * 24,
            updateAgeOnGet: options.updateAgeOnGet !== false,
            allowStale: options.allowStaleCache !== false,
            // Simplified fetchMethod for stale-while-revalidate pattern
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fetchMethod: async (key, staleValue, { context }) => {
                if (staleValue && options.staleWhileRevalidate !== false) {
                    // Background refresh using a mini-pipeline or direct logic
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
            enabled: options.minConfidence !== undefined ||
                options.saveReviewQueue ||
                options.confidenceScoring?.enabled ||
                false,
            autoApproveThreshold: options.confidenceScoring?.autoApproveThreshold || 0.9,
            reviewThreshold: options.confidenceScoring?.reviewThreshold || 0.7,
            rejectThreshold: options.confidenceScoring?.rejectThreshold || 0.5,
            saveReviewQueue: options.saveReviewQueue || options.confidenceScoring?.saveReviewQueue || false,
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
    _buildPipeline() {
        // 1. Validation
        this.pipeline.use(new InputValidationStep(this.advanced.maxKeyLength));
        // 2. Cache Read
        if (this.translationCache) {
            this.pipeline.use(new CacheReadStep(this.translationCache, this.cacheStats, {
                enabled: this.options.cacheEnabled,
            }));
        }
        // 3. Glossary Pre-processing
        this.pipeline.use(new GlossaryPreStep(this.glossaryManager));
        // 4. Translation
        this.pipeline.use(new TranslationStep(this.options, this.confidenceSettings));
        // 5. Glossary Post-processing
        this.pipeline.use(new GlossaryPostStep(this.glossaryManager));
        // 6. Quality Check & JSON Validation
        this.pipeline.use(new QualityCheckStep(this.qualityChecker, this.advanced.debug));
        // 7. Confidence Check
        this.pipeline.use(new ConfidenceCheckStep(this.confidenceSettings, this.advanced.debug));
        // 8. Cache Write
        if (this.translationCache) {
            this.pipeline.use(new CacheWriteStep(this.translationCache, this.cacheStats, {
                enabled: this.options.cacheEnabled,
            }));
        }
    }
    async processTranslation(key, text, targetLang, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contextData, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingTranslation) {
        const context = createTranslationContext(key, text, this.options.source, targetLang, this.options, contextData, existingTranslation);
        await this.pipeline.execute(context);
        return context.result;
    }
    async processTranslations(items) {
        this.progress.start(items.length, items[0].targetLang);
        const limit = pLimit(this.concurrencyLimit);
        const contextBatchSize = this.advanced.maxBatchSize;
        const chunks = this._chunkArray(items, contextBatchSize);
        if (this.advanced.debug) {
            log(`Processing ${items.length} items with concurrency limit ${this.concurrencyLimit}`, true);
        }
        console.log(""); // Empty line for progress bar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allPromises = [];
        for (const chunk of chunks) {
            const texts = chunk.map((item) => item.text);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let contextResults = [];
            try {
                contextResults = await this.contextProcessor.analyzeBatch(texts);
            }
            catch (error) {
                console.warn(`Context analysis failed for batch: ${error.message}`);
            }
            for (let i = 0; i < chunk.length; i++) {
                const item = chunk[i];
                const contextData = contextResults[i] || (await this.contextProcessor.analyze(item.text));
                const promise = limit(async () => {
                    try {
                        const result = await this.processTranslation(item.key, item.text, item.targetLang, contextData, item.existingTranslation);
                        this.progress.increment(result.success ? "success" : "failed");
                        return result;
                    }
                    catch (error) {
                        this.progress.increment("failed");
                        return {
                            key: item.key,
                            translated: item.text,
                            error: error.message,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _chunkArray(array, chunkSize) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            if (memoryGB >= 8 && cpuCount >= 4) {
                this.concurrencyLimit = Math.min(20, cpuCount * 2);
            }
            else if (memoryGB >= 4 && cpuCount >= 2) {
                this.concurrencyLimit = Math.min(10, cpuCount * 2);
            }
            else {
                this.concurrencyLimit = 4;
            }
            if (this.advanced.debug) {
                log(`Auto-optimized settings - CPU: ${cpuCount}, Memory: ${memoryGB}GB, Concurrency: ${this.concurrencyLimit}`, true);
            }
        }
        catch (error) {
            console.warn("Failed to auto-optimize settings:", error.message);
        }
    }
    clearCache() {
        if (this.translationCache) {
            this.translationCache.clear();
        }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCacheStats() {
        if (!this.translationCache)
            return {};
        return {
            ...this.cacheStats,
            size: this.translationCache.size,
            capacity: this.translationCache.max,
            hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
        };
    }
    // Used by background revalidation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async _refreshCacheEntry(key, context) {
        if (!context || !context.text || !context.targetLang) {
            return;
        }
        try {
            // Use the full pipeline for refresh, but skip cache read to force re-translation
            // pass specific options merged with global options
            const refreshOptions = {
                ...this.options,
                skipCache: true,
                staleWhileRevalidate: false, // Prevent infinite recursion matching this condition
            };
            const ctx = createTranslationContext(key, context.text, this.options.source, context.targetLang, refreshOptions, context.contextData);
            await this.pipeline.execute(ctx);
            // Stats are handled within steps (TranslationStep adds confidence, CacheWriteStep updates cache & stats)
            this.cacheStats.refreshes++;
        }
        catch (error) {
            console.warn(`Failed to refresh cache entry: ${error.message}`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getStatus() {
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
    saveReviewQueue() {
        if (!this.confidenceSettings.saveReviewQueue ||
            this.confidenceSettings.reviewQueue.length === 0) {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                minConfidence: this.options.minConfidence,
                items: this.confidenceSettings.reviewQueue,
                stats: {
                    total: this.confidenceSettings.reviewQueue.length,
                    byLanguage: this._groupByLanguage(this.confidenceSettings.reviewQueue),
                    byConfidenceLevel: this._groupByConfidenceLevel(this.confidenceSettings.reviewQueue),
                },
            };
            fs.writeFileSync(reviewFile, JSON.stringify(data, null, 2));
            console.log(`\nReview queue saved: ${this.confidenceSettings.reviewQueue.length} items need review`);
            console.log(`   File: ${reviewFile}`);
            console.log(`   Run 'localize review' to start interactive review\n`);
        }
        catch (error) {
            console.warn(`Warning: Failed to save review queue: ${error.message}`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _groupByConfidenceLevel(items) {
        const grouped = { high: 0, medium: 0, low: 0, very_low: 0 };
        items.forEach((item) => {
            if (grouped[item.confidence.level] !== undefined) {
                grouped[item.confidence.level]++;
            }
        });
        return grouped;
    }
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
