/**
 * Interactive Review Command.
 * Allows manual review of low-confidence translations.
 */

import fs from "fs";
import path from "path";
import readline from "readline";
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
	private currentIndex: number;
	private decisions: ReviewDecisions;

	/**
	 * Initialize ReviewCommand.
	 * @param {ReviewCommandConfig} config - Configuration object.
	 */
	constructor(config: ReviewCommandConfig) {
		this.config = config;
		this.reviewQueue = [];
		this.currentIndex = 0;
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
			console.log(`\nLoaded ${this.reviewQueue.length} items for review\n`);
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
			console.log("\nNo items need review. All translations meet quality threshold!\n");
			return;
		}

		console.log("━".repeat(70));
		console.log(`Review Queue: ${this.reviewQueue.length} translations need attention`);
		console.log("━".repeat(70));

		for (let i = 0; i < this.reviewQueue.length; i++) {
			this.currentIndex = i;
			const item = this.reviewQueue[i];

			const decision = await this.reviewItem(item, i + 1, this.reviewQueue.length);

			if (decision === "quit") {
				break;
			}
		}

		this.showSummary();
		this.saveDecisions();
	}

	/**
	 * Review a single translation item.
	 * @param {ReviewItem} item - Translation item to review.
	 * @param {number} current - Current item index (1-based).
	 * @param {number} total - Total items.
	 * @returns {Promise<string>} - Decision result.
	 */
	async reviewItem(item: ReviewItem, current: number, total: number): Promise<string> {
		console.log(`\n[${current}/${total}] Translation Review`);
		console.log("━".repeat(70));
		console.log(`Key:        ${item.key}`);
		console.log(`Language:   ${item.language}`);
		const score = item.confidence?.score || 0;
		const level = item.confidence?.level || "unknown";
		console.log(`Confidence: ${ConfidenceScorer.formatConfidence(score)} (${level})`);
		console.log(`Category:   ${item.category || "general"}`);

		console.log(`\nSource:`);
		console.log(`  "${item.source}"`);

		console.log(`\nTranslation:`);
		console.log(`  "${item.translation}"`);

		// Show issues if any
		if (item.confidence?.issues && item.confidence.issues.length > 0) {
			console.log(`\nIssues Detected:`);
			item.confidence.issues.forEach((issue) => {
				const icon = issue.severity === "critical" ? "[!]" : "[*]";
				console.log(`  ${icon} ${issue.message}`);
			});
		}

		console.log(`\nActions:`);
		console.log(`  [A] Accept    [E] Edit    [R] Reject    [S] Skip`);
		console.log(`  [N] Next      [Q] Quit    [?] Help`);

		const action = await this.getUserInput("\nYour choice: ");

		return this.handleAction(action.toLowerCase(), item);
	}

	/**
	 * Handle user action input.
	 * @param {string} action - User action code.
	 * @param {ReviewItem} item - Current item.
	 * @returns {Promise<string>} - Result status.
	 */
	async handleAction(action: string, item: ReviewItem): Promise<string> {
		switch (action) {
			case "a":
			case "accept":
				this.decisions.accepted.push(item);
				console.log("Accepted");
				return "continue";

			case "edit": {
				const edited = await this.editTranslation(item);
				this.decisions.edited.push(edited);
				console.log("Edited and saved");
				return "continue";
			}

			case "r":
			case "reject":
				this.decisions.rejected.push(item);
				console.log("Rejected - will be retranslated");
				return "continue";

			case "s":
			case "skip":
				this.decisions.skipped.push(item);
				console.log("Skipped");
				return "continue";

			case "n":
			case "next":
				return "continue";

			case "q":
			case "quit":
				console.log("\n👋 Exiting review session...");
				return "quit";

			case "?":
			case "help":
				this.showHelp();
				return this.handleAction(await this.getUserInput("\nYour choice: "), item);

			default:
				console.log("Invalid action. Try again.");
				return this.handleAction(await this.getUserInput("\nYour choice: "), item);
		}
	}

	/**
	 * Edit translation interactively.
	 * @param {ReviewItem} item - Item to edit.
	 * @returns {Promise<ReviewItem>} - Edited item.
	 */
	async editTranslation(item: ReviewItem): Promise<ReviewItem> {
		console.log(`\nCurrent: "${item.translation}"`);
		const newTranslation = await this.getUserInput("New translation: ");

		if (newTranslation.trim() === "") {
			console.log("Warning: Empty translation, keeping original");
			return item;
		}

		// Recalculate confidence for edited translation
		const newConfidence = ConfidenceScorer.calculateConfidence({
			aiConfidence: 1.0, // Manual edit gets high confidence
			sourceText: item.source,
			translation: newTranslation,
			sourceLang: item.sourceLang || this.config.source,
			targetLang: item.language,
			provider: "manual",
			category: item.category,
		});

		return {
			...item,
			translation: newTranslation,
			confidence: newConfidence,
			edited: true,
			editedAt: new Date().toISOString(),
		};
	}

	/**
	 * Show help information to the user.
	 */
	showHelp(): void {
		console.log("\n━━━ Help ━━━");
		console.log("A (Accept):  Approve translation as-is");
		console.log("E (Edit):    Modify the translation manually");
		console.log("R (Reject):  Mark for retranslation");
		console.log("S (Skip):    Skip for now, review later");
		console.log("N (Next):    Skip to next item");
		console.log("Q (Quit):    Exit review session");
		console.log("? (Help):    Show this help message");
		console.log("━".repeat(70));
	}

	/**
	 * Show summary of review session.
	 */
	showSummary(): void {
		console.log("\n━".repeat(70));
		console.log("Review Summary");
		console.log("━".repeat(70));
		console.log(`Accepted:  ${this.decisions.accepted.length}`);
		console.log(`Edited:    ${this.decisions.edited.length}`);
		console.log(`Rejected:  ${this.decisions.rejected.length}`);
		console.log(`Skipped:   ${this.decisions.skipped.length}`);
		console.log(
			`Total:     ${this.decisions.accepted.length + this.decisions.edited.length + this.decisions.rejected.length + this.decisions.skipped.length}/${this.reviewQueue.length}`
		);
		console.log("━".repeat(70));
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
		console.log(`\nDecisions saved to: ${decisionsFile}`);

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
	 * Get user input from terminal.
	 * @param {string} prompt - Prompt to display.
	 * @returns {Promise<string>} - User input.
	 */
	getUserInput(prompt: string): Promise<string> {
		return new Promise((resolve) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			rl.question(prompt, (answer) => {
				rl.close();
				resolve(answer.trim());
			});
		});
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
