import fs from "fs";
import os from "os";
import path from "path";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import ReviewCommand, { ReviewItem } from "../../../src/commands/review.js";

// Only the interactive prompt is stubbed; the file system is real.
vi.mock("prompts");

const item = (key: string, translation: string): ReviewItem => ({
	key,
	language: "es",
	source: "Hello",
	translation,
	confidence: { score: 0.5, level: "low", issues: [] },
});

describe("ReviewCommand applying approved translations", () => {
	let tmpDir: string;
	let localesDir: string;
	let warn: MockInstance<typeof console.warn>;

	/** Queue `items`, write `es.json`, approve every item, and return the resulting locale file. */
	const approveAll = async (items: ReviewItem[], esJson: object): Promise<unknown> => {
		fs.mkdirSync(path.join(tmpDir, ".localize-cache"), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, ".localize-cache", "review-queue.json"),
			JSON.stringify({ items })
		);
		fs.writeFileSync(path.join(localesDir, "es.json"), JSON.stringify(esJson));
		for (let i = 0; i < items.length; i++) {
			vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });
		}

		await new ReviewCommand({ localesDir, source: "en" }).startReview();

		return JSON.parse(fs.readFileSync(path.join(localesDir, "es.json"), "utf8"));
	};

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locai-review-"));
		localesDir = path.join(tmpDir, "locales");
		fs.mkdirSync(localesDir);
		vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "clear").mockImplementation(() => {});
		warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(prompts).mockReset();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes approved nested keys, creating missing parents", async () => {
		const result = await approveAll([item("menu.file.open", "Abrir")], { title: "Título" });

		expect(result).toEqual({ title: "Título", menu: { file: { open: "Abrir" } } });
	});

	it("keeps an existing string where a parent key is needed and still applies the rest", async () => {
		const result = await approveAll(
			[item("a.b", "nuevo"), item("c.d", "Cerrar"), item("e", "Editar")],
			{ a: "existente", c: {} }
		);

		expect(result).toEqual({ a: "existente", c: { d: "Cerrar" }, e: "Editar" });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a.b"'));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a" already holds a string'));
	});

	it("keeps an existing nested object where the approved key is a leaf", async () => {
		const result = await approveAll(
			[item("a", "nuevo"), item("c.d", "Cerrar"), item("e", "Editar")],
			{ a: { b: "existente" }, c: { d: "Viejo" }, e: "Viejo" }
		);

		expect(result).toEqual({ a: { b: "existente" }, c: { d: "Cerrar" }, e: "Editar" });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('Skipped "a" for es: "a" already holds nested keys')
		);
	});

	it("leaves the locale file untouched when no approved key can be applied", async () => {
		const original = '{"a":"existente"}';
		fs.mkdirSync(path.join(tmpDir, ".localize-cache"), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, ".localize-cache", "review-queue.json"),
			JSON.stringify({ items: [item("a.b", "nuevo")] })
		);
		fs.writeFileSync(path.join(localesDir, "es.json"), original);
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });

		await new ReviewCommand({ localesDir, source: "en" }).startReview();

		expect(fs.readFileSync(path.join(localesDir, "es.json"), "utf8")).toBe(original);
	});
});
