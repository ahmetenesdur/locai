import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	readReviewQueue,
	reviewQueuePath,
	updateReviewQueue,
	ReviewQueueFile,
	ReviewQueueItem,
} from "../../../src/utils/review-queue.js";

const item = (language: string, key: string, translation = `${key} (${language})`) =>
	({
		key,
		language,
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

describe("review queue file", () => {
	const originalCwd = process.cwd();
	let projectDir: string;

	beforeEach(() => {
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-queue-")));
		process.chdir(projectDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	it("should report a missing queue as null", () => {
		expect(readReviewQueue()).toBeNull();
	});

	it("should write .localize-cache/review-queue.json in the working directory", () => {
		const queued = item("es", "greeting");

		const { file, size } = updateReviewQueue([queued], [queued]);

		expect(file).toBe(path.join(projectDir, ".localize-cache", "review-queue.json"));
		expect(file).toBe(reviewQueuePath());
		expect(size).toBe(1);
		const written: ReviewQueueFile = JSON.parse(fs.readFileSync(file, "utf8"));
		expect(written.items).toEqual([queued]);
		expect(readReviewQueue()).toEqual([queued]);
	});

	it("should replace queued items the new run scored again and keep the others", () => {
		updateReviewQueue(
			[],
			[item("es", "greeting"), item("es", "farewell"), item("de", "greeting")]
		);

		const retranslated = item("es", "inbox", "new");
		const { size } = updateReviewQueue(
			[
				{ language: "es", key: "greeting" },
				{ language: "es", key: "inbox" },
			],
			[retranslated]
		);

		expect(size).toBe(3);
		expect(readReviewQueue()).toEqual([
			item("es", "farewell"),
			item("de", "greeting"),
			retranslated,
		]);
	});
});
