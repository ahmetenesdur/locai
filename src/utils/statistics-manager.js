/**
 * Statistics manager to track translation progress and metrics
 */
export class StatisticsManager {
	constructor() {
		this.stats = this.initializeGlobalStats();
	}

	/**
	 * Initialize global statistics structure
	 */
	initializeGlobalStats() {
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
	reset() {
		this.stats = this.initializeGlobalStats();
	}

	/**
	 * Get current stats
	 */
	getStats() {
		return this.stats;
	}

	/**
	 * Initialize language stats
	 * @param {string} langCode
	 */
	initLanguageStats(langCode) {
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
