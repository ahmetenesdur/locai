import { LocalIndex } from "vectra";
import path from "path";
import fs from "fs";
import { log } from "../utils/logger.js";

export interface VectorStoreConfig {
	enabled: boolean;
	vectorDbPath: string;
	similarityThreshold?: number;
	exactMatchThreshold?: number;
}

export interface SearchResult {
	item: {
		text: string;
		translation: string;
		sourceLang: string;
		targetLang: string;
		metadata?: any;
	};
	score: number;
}

export class VectorStore {
	private index: LocalIndex | null = null;
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

			this.index = new LocalIndex(dbPath);

			if (!(await this.index.isIndexCreated())) {
				await this.index.createIndex();
			}

			this.initialized = true;
			// log(`Vector store initialized at ${dbPath}`, true);
		} catch (error: any) {
			console.error(`Failed to initialize vector store: ${error.message}`);
			this.config.enabled = false; // Disable if init fails
		}
	}

	async addItem(
		text: string,
		translation: string,
		sourceLang: string,
		targetLang: string,
		embedding: number[],
		metadata: any = {}
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
		} catch (error: any) {
			console.warn(`Failed to add item to vector store: ${error.message}`);
		}
	}

	async search(
		embedding: number[],
		targetLang: string,
		limit: number = 3
	): Promise<SearchResult[]> {
		if (!this.initialized || !this.index) return [];

		try {
			// @ts-ignore - Vectra types might be mismatched in this version
			const results = await this.index.queryItems(embedding, limit);

			// Filter by target language and map to result format
			return results
				.filter((result) => result.item.metadata.targetLang === targetLang)
				.map((result) => ({
					item: {
						text: result.item.metadata.text as string,
						translation: result.item.metadata.translation as string,
						sourceLang: result.item.metadata.sourceLang as string,
						targetLang: result.item.metadata.targetLang as string,
						metadata: result.item.metadata,
					},
					score: result.score,
				}));
		} catch (error: any) {
			console.warn(`Vector search failed: ${error.message}`);
			return [];
		}
	}
}
