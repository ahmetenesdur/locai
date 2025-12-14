import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { VectorStore } from "../../../services/vector-store.js";
import { EmbeddingProvider } from "../../../services/embedding-provider.js";
import { VectorMemoryStats } from "./VectorCacheReadStep.js";

export class VectorCacheWriteStep extends PipelineStep {
	private vectorStore: VectorStore;
	private embeddingProvider: EmbeddingProvider;
	private options: any;

	constructor(vectorStore: VectorStore, embeddingProvider: EmbeddingProvider, options: any = {}) {
		super();
		this.vectorStore = vectorStore;
		this.embeddingProvider = embeddingProvider;
		this.options = options;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		// Execute next steps first (which might be nothing as this is usually last)
		await next();

		// Check conditions to save:
		// 1. Enabled
		// 2. Translation successful
		// 3. Not from cache (exact or vector)
		if (
			!this.options.enabled ||
			!context.result?.success ||
			context.result?.fromCache ||
			!context.translatedText
		) {
			return;
		}

		try {
			// Get embedding: reuse if generated in read step, else generate
			let embedding = context.meta?.embedding;

			if (!embedding) {
				embedding = await this.embeddingProvider.getEmbedding(context.sourceText);
			}

			if (embedding && embedding.length > 0) {
				await this.vectorStore.addItem(
					context.sourceText,
					context.translatedText,
					context.sourceLang,
					context.targetLang,
					embedding,
					{
						category: context.meta?.category,
						key: context.key,
					}
				);
			}
		} catch (error: any) {
			console.warn(`Vector cache write failed: ${error.message}`);
		}
	}
}
