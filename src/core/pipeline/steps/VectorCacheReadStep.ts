import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { VectorStore } from "../../../services/vector-store.js";
import { EmbeddingProvider } from "../../../services/embedding-provider.js";

export interface VectorMemoryStats {
	hits: number; // Exact matches from vector store (high similarity)
	contextUsed: number; // Similar matches used as context
	misses: number;
}

export class VectorCacheReadStep extends PipelineStep {
	private vectorStore: VectorStore;
	private embeddingProvider: EmbeddingProvider;
	private stats: VectorMemoryStats;
	private options: any;

	constructor(
		vectorStore: VectorStore,
		embeddingProvider: EmbeddingProvider,
		stats: VectorMemoryStats,
		options: any = {}
	) {
		super();
		this.vectorStore = vectorStore;
		this.embeddingProvider = embeddingProvider;
		this.stats = stats;
		this.options = options;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		// Skip if disabled, or already has result (Exact Cache hit)
		if (
			!this.options.enabled ||
			context.result?.success ||
			context.result?.fromCache ||
			context.options?.skipCache
		) {
			await next();
			return;
		}

		try {
			// Generate embedding for source text
			// Optimization: If text is very short/garbage, maybe skip?
			// For now, process everything reasonable.
			const embedding = await this.embeddingProvider.getEmbedding(context.sourceText);

			if (embedding.length === 0) {
				await next();
				return;
			}

			// Store embedding in context for Write step to reuse (save API call)
			context.meta = context.meta || {};
			context.meta.embedding = embedding;

			const results = await this.vectorStore.search(embedding, context.targetLang, 1);
			const bestMatch = results[0];

			if (bestMatch) {
				const similarity = bestMatch.score;
				const exactThreshold = this.options.exactMatchThreshold || 0.98;
				const contextThreshold = this.options.similarityThreshold || 0.85;

				if (similarity >= exactThreshold) {
					// "Exact" Vector Match - Treat as cache hit
					this.stats.hits++;
					context.result = {
						key: context.key,
						translated: bestMatch.item.translation,
						success: true,
						fromCache: true, // From "Vector" cache
						context: {
							matchType: "vector-exact",
							similarity: similarity,
						},
						meta: {
							vectorMatch: true,
							similarity: similarity,
						},
					};
					// Short-circuit
					return;
				} else if (similarity >= contextThreshold) {
					// Context Match - Provide to LLM
					this.stats.contextUsed++;
					context.meta.similarTranslation = {
						source: bestMatch.item.text,
						target: bestMatch.item.translation,
						similarity: similarity,
					};
				} else {
					this.stats.misses++;
				}
			} else {
				this.stats.misses++;
			}
		} catch (error: any) {
			console.warn(`Vector cache read failed: ${error.message}`);
			// Continue pipeline on error
		}

		await next();
	}
}
