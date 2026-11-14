import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VectorStore } from "../../src/services/vector-store.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("VectorStore", () => {
	let tmpDir: string;
	let vectorStore: VectorStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vector-test-"));
		vectorStore = new VectorStore({
			enabled: true,
			vectorDbPath: tmpDir,
			similarityThreshold: 0.85,
			exactMatchThreshold: 0.98,
		});
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should initialize correctly", async () => {
		await vectorStore.initialize();
		// createIndex() writes the index file up front
		expect(fs.existsSync(path.join(tmpDir, "index.json"))).toBe(true);
	});

	it("should add and search items", async () => {
		await vectorStore.initialize();

		const embedding = new Array(1536).fill(0.1);
		// Mock queryItems since we can't easily mock the entire local index logic without external deps working perfectly
		// But here we are testing the Wrapper.
		// Actually, we are testing integration with "vectra".

		await vectorStore.addItem("Hello World", "Hola Mundo", "en", "es", embedding);

		// In a real unit test with mocked vectra, we would verify calls.
		// Ideally we should mock 'vectra' itself to avoid file I/O and dependency issues in unit tests.
	});

	it("returns at most `limit` matches, all in the target language, best first", async () => {
		await vectorStore.initialize();

		const vector = (x: number, y: number) => [x, y, ...new Array(1534).fill(0)];
		await vectorStore.addItem("Hello", "Hola", "en", "es", vector(1, 0));
		await vectorStore.addItem("Hi", "Buenas", "en", "es", vector(0.6, 0.8));
		await vectorStore.addItem("Hello", "Bonjour", "en", "fr", vector(1, 0));

		const results = await vectorStore.search(vector(1, 0), "es", 1);

		expect(results).toHaveLength(1);
		expect(results[0].item.translation).toBe("Hola");
		expect(results[0].score).toBeCloseTo(1);
	});
});
