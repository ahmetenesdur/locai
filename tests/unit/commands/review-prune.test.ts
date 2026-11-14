import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prompts from "prompts";
import ReviewCommand from "../../../src/commands/review.js";
import {
	readReviewQueue,
	updateReviewQueue,
	ReviewQueueItem,
} from "../../../src/utils/review-queue.js";

// The reviewer's answers come from the terminal
vi.mock("prompts");

const item = (key: string, translation: string) =>
	({
		key,
		language: "es",
		source: key,
		translation,
		confidence: {
			score: 0.6,
			level: "low",
			qualityScore: 0.6,
			details: { categoryAdjustment: 1, languageFactor: 1, providerReliability: 1 },
			issues: [],
		},
		sourceLang: "en",
		category: "general",
		rejected: false,
		timestamp: "2026-01-01T00:00:00.000Z",
	}) satisfies ReviewQueueItem;

const queuedKeys = () => (readReviewQueue() || []).map((queued) => queued.key);

describe("ReviewCommand review queue", () => {
	const originalCwd = process.cwd();
	let projectDir: string;
	let localesDir: string;

	beforeEach(() => {
		vi.mocked(prompts).mockReset();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "clear").mockImplementation(() => {});

		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-review-")));
		localesDir = path.join(projectDir, "locales");
		fs.mkdirSync(localesDir);
		fs.writeFileSync(path.join(localesDir, "es.json"), JSON.stringify({ greeting: "Hola" }));
		process.chdir(projectDir);

		updateReviewQueue(
			[],
			[
				item("inbox.count", "Tienes {count} mensajes nuevos."),
				item("files.delete", "¿Eliminar?"),
				item("settings", "Settings"),
				item("title", "Título"),
			]
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("should drop approved and edited items and keep skipped and unvisited ones", async () => {
		vi.mocked(prompts)
			.mockResolvedValueOnce({ action: "approve" })
			.mockResolvedValueOnce({ action: "edit" })
			.mockResolvedValueOnce({ newTranslation: "¿Eliminar {file}?" })
			.mockResolvedValueOnce({ action: "skip" })
			.mockResolvedValueOnce({ action: "exit" });

		await new ReviewCommand({ localesDir, source: "en" }).startReview();

		expect(JSON.parse(fs.readFileSync(path.join(localesDir, "es.json"), "utf8"))).toEqual({
			greeting: "Hola",
			inbox: { count: "Tienes {count} mensajes nuevos." },
			files: { delete: "¿Eliminar {file}?" },
		});
		expect(queuedKeys()).toEqual(["settings", "title"]);
	});

	it("should keep an approved item queued when applying did not write it", async () => {
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });
		vi.mocked(prompts).mockResolvedValueOnce({ action: "exit" });
		const review = new ReviewCommand({ localesDir, source: "en" });
		// As if applyDecisions had skipped the item
		vi.spyOn(review, "applyDecisions").mockImplementation(() => {});

		await review.startReview();

		expect(queuedKeys()).toEqual(["inbox.count", "files.delete", "settings", "title"]);
	});

	it("should leave the queue alone when applying fails", async () => {
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });
		vi.mocked(prompts).mockResolvedValueOnce({ action: "exit" });
		const review = new ReviewCommand({ localesDir, source: "en" });
		vi.spyOn(review, "applyDecisions").mockImplementation(() => {
			throw new Error("cannot write es.json");
		});

		await expect(review.startReview()).rejects.toThrow("cannot write es.json");

		expect(queuedKeys()).toEqual(["inbox.count", "files.delete", "settings", "title"]);
	});
});
