import fs from "fs";
import path from "path";
import prompts from "prompts";
import ConfidenceScorer from "../utils/confidence-scorer.js";

interface ReviewItem {
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

interface ReviewDecisions {
	accepted: ReviewItem[];
	edited: ReviewItem[];
	rejected: ReviewItem[];
	skipped: ReviewItem[];
}

interface ReviewCommandConfig {
	localesDir: string;
	source: string;
	[key: string]: any;
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
		const reviewFile = path.join(process.cwd(), ".localize-cache", "review-queue.json");

		if (!fs.existsSync(reviewFile)) {
			console.log("\nNo review queue found.");
			console.log(
				"   Run translation with confidence scoring first: localize translate --min-confidence 0.8"
			);
			return false;
		}

		try {
			const data = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
			this.reviewQueue = data.items || [];
			return true;
		} catch (error: any) {
			console.error(`Error loading review queue: ${error.message}`);
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

		Object.entries(byLanguage).forEach(([lang, items]) => {
			const localeFile = path.join(this.config.localesDir, `${lang}.json`);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let localeData: any = {};
			if (fs.existsSync(localeFile)) {
				localeData = JSON.parse(fs.readFileSync(localeFile, "utf8"));
			}

			items.forEach((item) => {
				this.setNestedValue(localeData, item.key, item.translation);
			});

			fs.writeFileSync(localeFile, JSON.stringify(localeData, null, 2) + "\n");
			console.log(`   Updated ${lang}.json (${items.length} translations)`);
		});

		console.log("\nAll approved translations applied!");
	}

	/**
	 * Set nested value in object using dot notation.
	 * @param {any} obj - Object to modify.
	 * @param {string} path - Dot notation path.
	 * @param {any} value - Value to set.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setNestedValue(obj: any, path: string, value: any): void {
		const keys = path.split(".");
		let current = obj;

		for (let i = 0; i < keys.length - 1; i++) {
			if (!current[keys[i]]) {
				current[keys[i]] = {};
			}
			current = current[keys[i]];
		}

		current[keys[keys.length - 1]] = value;
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
