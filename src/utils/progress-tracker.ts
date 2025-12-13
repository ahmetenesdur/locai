/**
 * Progress tracking for translation operations
 */

export interface ProgressOptions {
	logToConsole?: boolean;
	logFrequency?: number;
}

export interface ProgressStatistics {
	avgTimePerItem: number;
	recentAvgTimePerItem?: number;
	totalTime: number;
	estimatedTimeRemaining: number;
	itemsPerSecond: number;
	percentComplete: number;
	successRate: number;
	startTime?: string;
	estimatedEndTime?: string;
}

export interface ProgressStatus {
	total: number;
	completed: number;
	success: number;
	failed: number;
	language: string | null;
	inProgress: boolean;
	statistics: ProgressStatistics;
}

class ProgressTracker {
	private logToConsole: boolean;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private logFrequency: number;

	private _isUpdating: boolean;
	private _pendingUpdates: { type: string; timestamp: number }[];
	private _spinnerInterval: NodeJS.Timeout | null;
	private _spinnerIndex: number;
	private _spinnerFrames: string[];

	private total: number;
	private completed: number;
	private success: number;
	private failed: number;
	private startTime: number | null;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private endTime: number | null;
	private lastUpdateTime: number | null;
	private recentOperationTimes: number[];
	private language: string | null;
	private isCompleted: boolean;
	private statistics: ProgressStatistics;

	constructor(options: ProgressOptions = {}) {
		this.logToConsole = options.logToConsole !== false;
		this.logFrequency = options.logFrequency || 1;

		this._isUpdating = false;
		this._pendingUpdates = [];
		this._spinnerInterval = null;
		this._spinnerIndex = 0;
		this._spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

		// Initialize fields to satisfy TypeScript before calling reset()
		this.total = 0;
		this.completed = 0;
		this.success = 0;
		this.failed = 0;
		this.startTime = null;
		this.endTime = null;
		this.lastUpdateTime = null;
		this.recentOperationTimes = [];
		this.language = null;
		this.isCompleted = false;

		this.statistics = {
			avgTimePerItem: 0,
			totalTime: 0,
			estimatedTimeRemaining: 0,
			itemsPerSecond: 0,
			percentComplete: 0,
			successRate: 0,
		};

		this.reset();
	}

	reset(): void {
		// Stop any existing spinner
		this._stopSpinner();

		this.total = 0;
		this.completed = 0;
		this.success = 0;
		this.failed = 0;
		this.startTime = null;
		this.endTime = null;
		this.lastUpdateTime = null;
		this.recentOperationTimes = [];
		this.language = null;
		this.isCompleted = false;

		this._isUpdating = false;
		this._pendingUpdates = [];

		this.statistics = {
			avgTimePerItem: 0,
			totalTime: 0,
			estimatedTimeRemaining: 0,
			itemsPerSecond: 0,
			percentComplete: 0,
			successRate: 0,
		};
	}

	start(total: number, language: string | null = null): void {
		this.reset();
		this.total = Math.max(0, total);
		this.startTime = Date.now();
		this.lastUpdateTime = Date.now();
		this.language = language;
		this.isCompleted = false;

		if (this.logToConsole && this.total > 0) {
			// Start spinner animation
			this._startSpinner();
			this._renderProgress();
		}
	}

	increment(type: string = "success"): void {
		if (!this.startTime) {
			throw new Error("Progress tracker not started");
		}

		if (this.isCompleted) {
			return;
		}

		if (this._isUpdating) {
			this._pendingUpdates.push({ type, timestamp: Date.now() });
			return;
		}

		this._processUpdate(type);
	}

	private _processUpdate(type: string): void {
		this._isUpdating = true;

		try {
			if (this.isCompleted) {
				return;
			}

			const previousCompleted = this.completed;
			this.completed = Math.min(this.total, this.completed + 1);

			if (this.completed > previousCompleted) {
				if (type === "success") {
					this.success = Math.min(this.completed, this.success + 1);
				} else if (type === "failed") {
					this.failed = Math.min(this.completed, this.failed + 1);
				}
			}

			this._ensureDataConsistency();

			const now = Date.now();
			const timeSinceLastUpdate = now - (this.lastUpdateTime || now);
			this.lastUpdateTime = now;

			const MAX_OPERATION_TIMES = 10;
			this.recentOperationTimes.push(timeSinceLastUpdate);
			if (this.recentOperationTimes.length > MAX_OPERATION_TIMES) {
				this.recentOperationTimes.shift(); // Keep only last 10
			}

			this._updateStatistics();

			if (this.logToConsole && this._shouldLog()) {
				this._renderProgress();
			}

			if (this.completed >= this.total && !this.isCompleted) {
				this.endTime = Date.now();
				this.isCompleted = true;
				this._stopSpinner();
				this._renderProgress(true); // Final render
				if (this.logToConsole) {
					this._finalReport();
				}
			}
		} finally {
			this._isUpdating = false;

			this._processPendingUpdates();
		}
	}

	private _ensureDataConsistency(): void {
		this.completed = Math.min(this.total, Math.max(0, this.completed));
		this.success = Math.min(this.completed, Math.max(0, this.success));
		this.failed = Math.min(this.completed, Math.max(0, this.failed));

		const totalCounted = this.success + this.failed;
		if (totalCounted > this.completed) {
			if (this.success > this.completed) {
				this.success = this.completed;
				this.failed = 0;
			} else {
				this.failed = this.completed - this.success;
			}
		}
	}

	private _processPendingUpdates(): void {
		if (
			!this._pendingUpdates ||
			!Array.isArray(this._pendingUpdates) ||
			this._pendingUpdates.length === 0
		) {
			return;
		}

		setImmediate(() => {
			while (this._pendingUpdates && this._pendingUpdates.length > 0 && !this._isUpdating) {
				const updateItem = this._pendingUpdates.shift();

				if (updateItem && typeof updateItem === "object" && updateItem.type) {
					this._processUpdate(updateItem.type);
				}
			}
		});
	}

	private _shouldLog(): boolean {
		if (!this.logToConsole || this.total === 0) return false;
		return true;
	}

	private _startSpinner(): void {
		if (this._spinnerInterval) return;
		this._spinnerInterval = setInterval(() => {
			if (!this.isCompleted) {
				this._spinnerIndex = (this._spinnerIndex + 1) % this._spinnerFrames.length;
				this._renderProgress();
			}
		}, 80);
	}

	private _stopSpinner(): void {
		if (this._spinnerInterval) {
			clearInterval(this._spinnerInterval);
			this._spinnerInterval = null;
		}
	}

	private _renderProgress(final: boolean = false): void {
		const percent = this.total > 0 ? (this.completed / this.total) * 100 : 0;
		const langInfo = this.language ? `[${this.language}] ` : "";

		const barWidth = 20;
		const filledWidth = Math.max(
			0,
			Math.min(barWidth, Math.round((this.completed / this.total) * barWidth))
		);
		const emptyWidth = barWidth - filledWidth;
		const bar = "[" + "█".repeat(filledWidth) + "═".repeat(emptyWidth) + "]";

		let etaText = "";
		if (this.completed > 0 && this.completed < this.total) {
			const eta = this.statistics.estimatedTimeRemaining;
			if (eta < 60) {
				etaText = ` | ETA: ${Math.round(eta)}s`;
			} else if (eta < 3600) {
				etaText = ` | ETA: ${Math.floor(eta / 60)}m ${Math.round(eta % 60)}s`;
			} else {
				etaText = ` | ETA: ${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`;
			}
		}

		const spinner = final ? "[OK]" : this._spinnerFrames[this._spinnerIndex];
		const text = `${spinner} ${langInfo}${bar} ${percent.toFixed(1)}% | ${this.completed}/${this.total} items | OK ${this.success} | ERR ${this.failed}${etaText}`;

		process.stderr.write("\r\x1b[K" + text);

		if (final) {
			process.stderr.write("\n");
		}
	}

	private _updateStatistics(): void {
		if (!this.startTime) return;

		const elapsed = Date.now() - this.startTime;
		const averageTime = this.completed > 0 ? elapsed / this.completed : 0;

		let recentAverage = 0;
		if (this.recentOperationTimes.length >= 3) {
			recentAverage =
				this.recentOperationTimes.reduce((a, b) => a + b, 0) /
				this.recentOperationTimes.length;
		} else {
			recentAverage = averageTime;
		}

		const remaining = Math.max(0, this.total - this.completed);
		const estimatedTimeRemaining = remaining * Math.min(averageTime, recentAverage);

		const percentComplete = Math.min(
			100,
			Math.max(0, (this.completed / this.total) * 100 || 0)
		);

		const successRate =
			this.completed > 0
				? Math.min(100, Math.max(0, (this.success / this.completed) * 100))
				: 0;

		this.statistics = {
			avgTimePerItem: averageTime,
			recentAvgTimePerItem: recentAverage,
			totalTime: elapsed / 1000, // in seconds
			estimatedTimeRemaining: estimatedTimeRemaining / 1000, // in seconds
			itemsPerSecond: this.completed > 0 ? this.completed / (elapsed / 1000) : 0,
			percentComplete: percentComplete,
			successRate: successRate,
			startTime: new Date(this.startTime).toISOString(),
			estimatedEndTime: new Date(Date.now() + estimatedTimeRemaining).toISOString(),
		};
	}

	private _finalReport(): void {
		// Progress bar already displays the summary visually
		// Remove duplicate console output to keep it clean
	}

	getStatus(): ProgressStatus {
		return {
			total: this.total,
			completed: this.completed,
			success: this.success,
			failed: this.failed,
			language: this.language,
			inProgress: !!(this.startTime && !this.isCompleted),
			statistics: { ...this.statistics },
		};
	}

	setLogToConsole(value: boolean): void {
		this.logToConsole = value;
	}
}

export default ProgressTracker;
