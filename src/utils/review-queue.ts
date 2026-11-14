import fs from "fs";
import path from "path";
import type { ConfidenceResult } from "./confidence-scorer.js";

/** One key in one target language. */
export interface TranslationRef {
	language: string;
	key: string;
}

/** A translation flagged by confidence scoring, queued for `locai review`. */
export interface ReviewQueueItem extends TranslationRef {
	source: string;
	translation: string;
	confidence: ConfidenceResult;
	sourceLang: string;
	category: string;
	/** Scored below rejectThreshold, so the translation was not written to the locale file. */
	rejected: boolean;
	timestamp: string;
}

/** Content of `.localize-cache/review-queue.json`. */
export interface ReviewQueueFile {
	timestamp: string;
	items: ReviewQueueItem[];
}

/** The review queue file of the project in the working directory. */
export const reviewQueuePath = (): string =>
	path.join(process.cwd(), ".localize-cache", "review-queue.json");

/** Identity of a queued translation: its language and key. */
const refId = ({ language, key }: TranslationRef): string => JSON.stringify([language, key]);

/**
 * Read the review queue.
 * @returns The queued items, or null when there is no queue file.
 */
export function readReviewQueue(): ReviewQueueItem[] | null {
	const file = reviewQueuePath();
	if (!fs.existsSync(file)) {
		return null;
	}

	const data = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ReviewQueueFile>;
	return data.items || [];
}

/** Write `items` as the review queue. */
function writeReviewQueue(items: ReviewQueueItem[]): string {
	const file = reviewQueuePath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const data: ReviewQueueFile = { timestamp: new Date().toISOString(), items };
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
	return file;
}

/**
 * Add the flagged translations of a run to the review queue. Queued items for translations the
 * run scored again are dropped first: the new score replaces them.
 * @param scored - Every translation the run scored.
 * @param flagged - The translations the run flagged for review or rejected.
 * @returns The queue file and the number of items it now holds.
 */
export function updateReviewQueue(
	scored: TranslationRef[],
	flagged: ReviewQueueItem[]
): { file: string; size: number } {
	const rescored = new Set(scored.map(refId));
	const items = [
		...(readReviewQueue() || []).filter((item) => !rescored.has(refId(item))),
		...flagged,
	];

	return { file: writeReviewQueue(items), size: items.length };
}

/**
 * Remove reviewed translations from the review queue.
 * @param reviewed - The translations a review approved, edited or rejected.
 */
export function removeFromReviewQueue(reviewed: TranslationRef[]): void {
	const items = readReviewQueue();
	if (!items || reviewed.length === 0) {
		return;
	}

	const done = new Set(reviewed.map(refId));
	writeReviewQueue(items.filter((item) => !done.has(refId(item))));
}
