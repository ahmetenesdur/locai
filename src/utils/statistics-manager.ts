/**
 * Statistics manager to track translation progress and metrics
 */

export interface GlobalStats {
	total: number;
	byCategory: Record<string, number>;
	details: Record<string, { samples: number; totalConfidence: number }>;
	totalTime: number;
	success: number;
	failed: number;
	skipped: number;
	languages: Record<string, LanguageStats>;
	startTime: string;
	orchestrators: any[];
}

export interface LanguageStats {
	processed: number;
	added: number;
	skipped: number;
	failed: number;
	timeMs: number;
}

export class StatisticsManager {
	private stats: GlobalStats;

	constructor() {
		this.stats = this.initializeGlobalStats();
	}

	/**
	 * Initialize global statistics structure
	 */
	initializeGlobalStats(): GlobalStats {
		return {
			total: 0,
			byCategory: {},
			details: {},
			totalTime: 0,
			success: 0,
			failed: 0,
			skipped: 0,
			languages: {},
			startTime: new Date().toISOString(),
			orchestrators: [],
		};
	}

	/**
	 * Reset statistics
	 */
	reset(): void {
		this.stats = this.initializeGlobalStats();
	}

	/**
	 * Get current stats
	 */
	getStats(): GlobalStats {
		return this.stats;
	}

	/**
	 * Initialize language stats
	 */
	initLanguageStats(langCode: string): void {
		this.stats.languages[langCode] = {
			processed: 0,
			added: 0,
			skipped: 0,
			failed: 0,
			timeMs: 0,
		};
	}
}

export default new StatisticsManager();
