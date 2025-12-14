import * as openaiProvider from "../providers/openai.js";

/**
 * Interface for embedding providers
 */
export interface IEmbeddingProvider {
	getEmbedding(text: string): Promise<number[]>;
	getEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Service to generate embeddings for text
 */
export class EmbeddingProvider implements IEmbeddingProvider {
	private provider: string;
	private model: string;

	constructor(config: { provider?: string; model?: string } = {}) {
		this.provider = config.provider || "openai";
		this.model = config.model || "text-embedding-3-small";
	}

	/**
	 * Get embedding for a single text
	 */
	async getEmbedding(text: string): Promise<number[]> {
		if (!text) return [];

		try {
			if (this.provider === "openai") {
				// Use the shared provider implementation
				// Note: OpenAIProvider will handle auth, retries, and error logging
				return await openaiProvider.embed(text, { model: this.model });
			}

			// Fallback or other providers would go here
			console.warn(`Provider ${this.provider} not supported for embeddings yet.`);
			return [];
		} catch (error: any) {
			console.error(`Failed to generate embedding: ${error.message}`);
			return [];
		}
	}

	/**
	 * Get embeddings for multiple texts (batch)
	 */
	async getEmbeddings(texts: string[]): Promise<number[][]> {
		if (!texts || texts.length === 0) return [];

		try {
			if (this.provider === "openai") {
				return await openaiProvider.embedBatch(texts, { model: this.model });
			}
			return [];
		} catch (error: any) {
			console.error(`Failed to generate batch embeddings: ${error.message}`);
			return [];
		}
	}
}
