import PipelineStep from "../PipelineStep.js";
import crypto from "crypto";
import { TranslationContext, TranslationResult } from "../context.js";

/** Translation cache counters, shared by the orchestrator and the cache steps. */
export interface CacheStats {
	hits: number;
	misses: number;
	stored: number;
}

/** The part of the translation cache (an LRUCache) the cache steps use. */
export interface Cache {
	has(key: string): boolean;
	get(key: string): TranslationResult | undefined;
	set(key: string, value: TranslationResult): void;
	delete(key: string): void;
}

export interface CacheStepOptions {
	/** Set to false to bypass the cache (default enabled). */
	enabled?: boolean;
}

class CacheReadStep extends PipelineStep {
	private cache: Cache;
	private stats: CacheStats;
	private options: CacheStepOptions;

	constructor(cache: Cache, cacheStats: CacheStats, options: CacheStepOptions = {}) {
		super();
		this.cache = cache;
		this.stats = cacheStats;
		this.options = options;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		if (this.options.enabled === false) {
			await next();
			return;
		}

		const cacheKey = this._generateCacheKey(
			context.sourceText,
			context.targetLang,
			context.meta?.category
		);

		if (this.cache && this.cache.has(cacheKey)) {
			const cachedResult = this.cache.get(cacheKey);

			if (cachedResult && typeof cachedResult === "object") {
				this.stats.hits++;

				// Hydrate context result from cache
				context.result = {
					...cachedResult,
					key: context.key,
					fromCache: true,
				};

				// Short-circuit: Do NOT call next()
				return;
			} else {
				this.cache.delete(cacheKey); // Invalid entry
			}
		}

		this.stats.misses++;

		// Store cache key in context for Write step to use
		context.cacheKey = cacheKey;

		await next();
	}

	_generateCacheKey(text: string, targetLang: string, category: string = "unknown"): string {
		let keyContent;

		if (text.length <= 100) {
			keyContent = `${targetLang}:${category}:${text.toLowerCase()}`;
		} else if (text.length <= 500) {
			const start = text.substring(0, 40).toLowerCase();
			const middlePos = Math.floor(text.length / 2);
			const middle = text.substring(middlePos - 20, middlePos + 20).toLowerCase();
			const end = text.substring(text.length - 40).toLowerCase();
			keyContent = `${targetLang}:${category}:${start}|MID:${middle}|${end}`;
		} else {
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
}

export default CacheReadStep;
