import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { Cache, CacheStats, CacheStepOptions } from "./CacheReadStep.js";

class CacheWriteStep extends PipelineStep {
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
		// Only cache if successful and not from cache
		if (
			this.options.enabled !== false &&
			context.result &&
			context.result.success &&
			!context.result.fromCache &&
			context.cacheKey
		) {
			this.cache.set(context.cacheKey, context.result);
			this.stats.stored++;
		}

		await next();
	}
}

export default CacheWriteStep;
