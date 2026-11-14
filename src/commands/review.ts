import fs from "fs";
import path from "path";
import prompts from "prompts";
import ConfidenceScorer from "../utils/confidence-scorer.js";
import { readReviewQueue } from "../utils/review-queue.js";

/** A queued translation as the review reads it: the fields of a ReviewQueueItem it uses. */
export interface ReviewItem {
	key: string;
	language: string;
	source: string;
	translation: string;
	confidence: {
		score: number;
		level: string;
		issues: Array<{ severity: string; message: string }>;
	};
	category?: string;
	sourceLang?: string;
	edited?: boolean;
	editedAt?: string;
}

export interface ReviewDecisions {
	accepted: ReviewItem[];
	edited: ReviewItem[];
	rejected: ReviewItem[];
	skipped: ReviewItem[];
}

export interface ReviewCommandConfig {
	localesDir: string;
	source: string;
}

/** Nested locale file content: leaves are translations, branches are key segments. */
export interface LocaleTree {
	[key: string]: string | LocaleTree;
}

class ReviewCommand {
	private config: ReviewCommandConfig;
	private reviewQueue: ReviewItem[];
	private decisions: ReviewDecisions;

	/**
	 * Initialize ReviewCommand.
	 * @param {ReviewCommandConfig} config - Configuration object.
	 */
	constructor(config: ReviewCommandConfig) {
		this.config = config;
		this.reviewQueue = [];
		this.decisions = {
			accepted: [],
			edited: [],
			rejected: [],
			skipped: [],
		};
	}

	/**
	 * Load review queue from cache file.
	 * @returns {boolean} - True if loaded successfully, else false.
	 */
	loadReviewQueue(): boolean {
		try {
			const items = readReviewQueue();
			if (!items) {
				console.log("\nNo review queue found.");
				console.log(
					"   Run a translation that saves one first: locai translate --save-review-queue"
				);
				return false;
			}

			this.reviewQueue = items;
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Error loading review queue: ${message}`);
			return false;
		}
	}

	/**
	 * Start interactive review session.
	 */
	async startReview(): Promise<void> {
		if (!this.loadReviewQueue()) {
			return;
		}

		if (this.reviewQueue.length === 0) {
			console.log("No items to review.");
			return;
		}

		console.clear();
		console.log(`\nInteractive Review Mode (${this.reviewQueue.length} items)\n`);

		for (let i = 0; i < this.reviewQueue.length; i++) {
			const item = this.reviewQueue[i];
			const progress = `[${i + 1}/${this.reviewQueue.length}]`;

			console.log(`\n${progress} ${item.language.toUpperCase()} | Key: ${item.key}`);
			console.log(
				`Confidence: ${ConfidenceScorer.formatConfidence(item.confidence.score)} (${item.confidence.level})`
			);

			const response = await prompts({
				type: "select",
				name: "action",
				message: `Translation: "${item.translation}"\nSource:      "${item.source}"\nAction:`,
				choices: [
					{ title: "[Approve]", value: "approve" },
					{ title: "[Edit]", value: "edit" },
					{ title: "[Skip]", value: "skip" },
					{ title: "[Exit]", value: "exit" },
				],
				initial: 0,
			});

			if (response.action === "exit") break;

			await this.handleAction(response.action, item);
		}

		this.saveDecisions();
	}

	/**
	 * Handle user action input.
	 */
	private async handleAction(action: string, item: ReviewItem) {
		switch (action) {
			case "approve":
				this.decisions.accepted.push(item);
				break;
			case "edit": {
				const editResponse = await prompts({
					type: "text",
					name: "newTranslation",
					message: "Enter new translation:",
					initial: item.translation,
				});
				if (editResponse.newTranslation) {
					item.translation = editResponse.newTranslation;
					item.edited = true;
					this.decisions.edited.push(item);
				} else {
					this.decisions.skipped.push(item);
				}
				break;
			}
			case "skip":
				this.decisions.skipped.push(item);
				break;
		}
	}

	/**
	 * Save review decisions to disk and apply them.
	 */
	saveDecisions(): void {
		const cacheDir = path.join(process.cwd(), ".localize-cache");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}

		const decisionsFile = path.join(cacheDir, "review-decisions.json");

		const data = {
			timestamp: new Date().toISOString(),
			decisions: this.decisions,
			stats: {
				accepted: this.decisions.accepted.length,
				edited: this.decisions.edited.length,
				rejected: this.decisions.rejected.length,
				skipped: this.decisions.skipped.length,
			},
		};

		fs.writeFileSync(decisionsFile, JSON.stringify(data, null, 2));
		console.log(`\nReview complete! Decisions saved to ${decisionsFile}`);

		// Apply accepted and edited translations
		this.applyDecisions();
	}

	/**
	 * Apply accepted and edited translations to locale files.
	 */
	applyDecisions(): void {
		const toApply = [...this.decisions.accepted, ...this.decisions.edited];

		if (toApply.length === 0) {
			console.log("   No changes to apply");
			return;
		}

		console.log(`\nApplying ${toApply.length} approved translations...`);

		const byLanguage: Record<string, ReviewItem[]> = {};
		toApply.forEach((item) => {
			if (!byLanguage[item.language]) {
				byLanguage[item.language] = [];
			}
			byLanguage[item.language].push(item);
		});

		let skipped = 0;
		Object.entries(byLanguage).forEach(([lang, items]) => {
			const localeFile = path.join(this.config.localesDir, `${lang}.json`);

			let localeData: LocaleTree = {};
			if (fs.existsSync(localeFile)) {
				localeData = JSON.parse(fs.readFileSync(localeFile, "utf8")) as LocaleTree;
			}

			let applied = 0;
			items.forEach((item) => {
				const conflict = this.setNestedValue(localeData, item.key, item.translation);
				if (conflict) {
					skipped++;
					console.warn(
						`   Skipped "${item.key}" for ${lang}: ${conflict}; the existing value was kept`
					);
				} else {
					applied++;
				}
			});

			if (applied === 0) return;
			fs.writeFileSync(localeFile, JSON.stringify(localeData, null, 2) + "\n");
			console.log(`   Updated ${lang}.json (${applied} translations)`);
		});

		console.log(
			skipped === 0
				? "\nAll approved translations applied!"
				: `\nApplied ${toApply.length - skipped} approved translations; skipped ${skipped} (see warnings above).`
		);
	}

	/**
	 * Set nested value in object using dot notation. Missing parents are created; a parent
	 * that already holds a non-object value (e.g. a string translation) is never overwritten,
	 * and neither is a leaf that already holds nested keys.
	 * @param {LocaleTree} obj - Object to modify.
	 * @param {string} path - Dot notation path.
	 * @param {string} value - Value to set.
	 * @returns {string | null} - Why the value could not be set, or null when it was set.
	 */
	setNestedValue(obj: LocaleTree, path: string, value: string): string | null {
		const keys = path.split(".");
		let current = obj;

		for (let i = 0; i < keys.length - 1; i++) {
			const next: unknown = current[keys[i]];
			if (next === undefined) {
				current[keys[i]] = {};
			} else if (next === null || typeof next !== "object" || Array.isArray(next)) {
				const kind =
					next === null ? "null" : Array.isArray(next) ? "an array" : `a ${typeof next}`;
				return `"${keys.slice(0, i + 1).join(".")}" already holds ${kind}, not nested keys`;
			}
			current = current[keys[i]] as LocaleTree;
		}

		const leaf = keys[keys.length - 1];
		const existing: unknown = current[leaf];
		if (existing !== null && typeof existing === "object" && !Array.isArray(existing)) {
			return `"${path}" already holds nested keys, not a translation`;
		}

		current[leaf] = value;
		return null;
	}

	/**
	 * Export review queue to JSON.
	 * @param {string} format - Export format (json or csv).
	 */
	exportReviewQueue(format = "json"): void {
		if (this.reviewQueue.length === 0 && !this.loadReviewQueue()) {
			return;
		}

		const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
		const filename = `review-queue-${timestamp}.${format}`;

		if (format === "json") {
			fs.writeFileSync(filename, JSON.stringify(this.reviewQueue, null, 2));
			console.log(`\nReview queue exported to: ${filename}`);
		} else if (format === "csv") {
			const csv = this.convertToCSV(this.reviewQueue);
			fs.writeFileSync(filename, csv);
			console.log(`\nReview queue exported to: ${filename}`);
		}
	}

	/**
	 * Convert review queue to CSV format.
	 * @param {ReviewItem[]} items - Items to convert.
	 * @returns {string} - CSV content.
	 */
	convertToCSV(items: ReviewItem[]): string {
		const headers = [
			"Key",
			"Language",
			"Source",
			"Translation",
			"Confidence",
			"Level",
			"Category",
			"Issues",
		];
		const rows = items.map((item) => [
			item.key,
			item.language,
			item.source,
			item.translation,
			item.confidence.score.toFixed(3),
			item.confidence.level,
			item.category || "general",
			item.confidence.issues.map((i) => i.message).join("; "),
		]);

		const csvContent = [
			headers.join(","),
			...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
		].join("\n");

		return csvContent;
	}
}

export default ReviewCommand;
