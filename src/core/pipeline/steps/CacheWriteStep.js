import PipelineStep from "../PipelineStep.js";

class CacheWriteStep extends PipelineStep {
	/**
	 * @param {Object} cache - LRU Cache instance
	 * @param {Object} cacheStats - Stats object
	 * @param {Object} options - Cache options
	 */
	constructor(cache, cacheStats, options = {}) {
		super();
		this.cache = cache;
		this.stats = cacheStats;
		this.options = options;
	}

	async execute(context, next) {
		// Only cache if successful and not from cache
		if (
			this.options.enabled !== false &&
			context.result &&
			context.result.success &&
			!context.result.fromCache &&
			context.cacheKey
		) {
			this.cache.set(context.cacheKey, context.result, {
				context: {
					text: context.sourceText,
					targetLang: context.targetLang,
					contextData: context.meta,
				},
			});
			this.stats.stored++;
		}

		await next();
	}
}

export default CacheWriteStep;
