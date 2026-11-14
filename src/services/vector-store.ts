import { LocalIndex, MetadataTypes } from "vectra";
import path from "path";
import fs from "fs";

export interface VectorStoreConfig {
	enabled: boolean;
	vectorDbPath: string;
	similarityThreshold?: number;
	exactMatchThreshold?: number;
}

/** Extra metadata callers attach to a stored translation (e.g. key, category). */
export type VectorItemMetadata = Record<string, MetadataTypes>;

/** Metadata persisted with every vector: the translation pair plus caller metadata. */
export type TranslationMemoryMetadata = VectorItemMetadata & {
	text: string;
	translation: string;
	sourceLang: string;
	targetLang: string;
	timestamp: number;
};

export interface SearchResult {
	item: {
		text: string;
		translation: string;
		sourceLang: string;
		targetLang: string;
		metadata?: TranslationMemoryMetadata;
	};
	score: number;
}

export class VectorStore {
	private index: LocalIndex<TranslationMemoryMetadata> | null = null;
	private config: VectorStoreConfig;
	private initialized: boolean = false;
	private readonly DIMENSION = 1536; // OpenAI text-embedding-3-small dimension

	constructor(config: VectorStoreConfig) {
		this.config = config;
	}

	async initialize(): Promise<void> {
		if (!this.config.enabled) return;
		if (this.initialized) return;

		try {
			const dbPath = path.resolve(process.cwd(), this.config.vectorDbPath);

			if (!fs.existsSync(dbPath)) {
				fs.mkdirSync(dbPath, { recursive: true });
			}

			this.index = new LocalIndex<TranslationMemoryMetadata>(dbPath);

			if (!(await this.index.isIndexCreated())) {
				await this.index.createIndex();
			}

			this.initialized = true;
			// log(`Vector store initialized at ${dbPath}`, true);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Failed to initialize vector store: ${message}`);
			this.config.enabled = false; // Disable if init fails
		}
	}

	async addItem(
		text: string,
		translation: string,
		sourceLang: string,
		targetLang: string,
		embedding: number[],
		/** Undefined values are dropped when vectra serializes the index. */
		metadata: Partial<VectorItemMetadata> = {}
	): Promise<void> {
		if (!this.initialized || !this.index) return;

		try {
			await this.index.insertItem({
				vector: embedding,
				metadata: {
					text,
					translation,
					sourceLang,
					targetLang,
					...metadata,
					timestamp: Date.now(),
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to add item to vector store: ${message}`);
		}
	}

	async search(
		embedding: number[],
		targetLang: string,
		limit: number = 3
	): Promise<SearchResult[]> {
		if (!this.initialized || !this.index) return [];

		try {
			// @ts-expect-error -- vectra 0.12 is queryItems(vector, query, topK); `limit` lands in `query`, so topK is undefined and every item is returned (known bug, kept for behavior parity)
			const results = await this.index.queryItems(embedding, limit);

			// Filter by target language and map to result format
			return results
				.filter((result) => result.item.metadata.targetLang === targetLang)
				.map((result) => ({
					item: {
						text: result.item.metadata.text,
						translation: result.item.metadata.translation,
						sourceLang: result.item.metadata.sourceLang,
						targetLang: result.item.metadata.targetLang,
						metadata: result.item.metadata,
					},
					score: result.score,
				}));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Vector search failed: ${message}`);
			return [];
		}
	}
}
