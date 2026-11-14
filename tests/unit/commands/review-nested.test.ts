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

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

describe("ReviewCommand with the nested locale layout", () => {
	const originalCwd = process.cwd();
	let projectDir: string;
	let localesDir: string;

	beforeEach(() => {
		vi.mocked(prompts).mockReset();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "clear").mockImplementation(() => {});

		// locales/en/translation.json is the source, so `locai translate` writes
		// locales/<language>/translation.json
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-review-")));
		localesDir = path.join(projectDir, "locales");
		for (const [language, content] of [
			["en", { greeting: "Hello", inbox: { count: "You have {count} new messages." } }],
			["es", { greeting: "Hola" }],
		] as const) {
			fs.mkdirSync(path.join(localesDir, language), { recursive: true });
			fs.writeFileSync(
				path.join(localesDir, language, "translation.json"),
				JSON.stringify(content)
			);
		}
		process.chdir(projectDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("should write approved translations to <language>/translation.json", async () => {
		const flagged = item("inbox.count", "Tienes {count} mensajes nuevos.");
		updateReviewQueue([], [flagged]);
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });

		await new ReviewCommand({ localesDir, source: "en" }).startReview();

		expect(readJson(path.join(localesDir, "es", "translation.json"))).toEqual({
			greeting: "Hola",
			inbox: { count: "Tienes {count} mensajes nuevos." },
		});
		expect(fs.existsSync(path.join(localesDir, "es.json"))).toBe(false);
		expect(readReviewQueue()).toEqual([]);
	});

	it("should create the language folder for a language with no file yet", async () => {
		updateReviewQueue([], [{ ...item("greeting", "Bonjour"), language: "fr" }]);
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });

		await new ReviewCommand({ localesDir, source: "en" }).startReview();

		expect(readJson(path.join(localesDir, "fr", "translation.json"))).toEqual({
			greeting: "Bonjour",
		});
		expect(fs.existsSync(path.join(localesDir, "fr.json"))).toBe(false);
	});
});
