import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { Cache, CacheStats } from "./CacheReadStep.js";

class CacheWriteStep extends PipelineStep {
	private cache: Cache;
	private stats: CacheStats;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private options: any;

	constructor(cache: Cache, cacheStats: CacheStats, options: any = {}) {
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
