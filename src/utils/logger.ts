/**
 * Advanced Logging System.
 * Implements saveErrorLogs, logDirectory, logRotation, and other logging features.
 */

import path from "path";
import { promises as fsPromises } from "fs";

export interface LogRotationConfig {
	enabled: boolean;
	maxFiles: number;
	maxSize: number;
}

export interface LoggerConfig {
	verbose?: boolean;
	diagnosticsLevel?: "minimal" | "normal" | "detailed";
	outputFormat?: "pretty" | "json" | "simple";
	saveErrorLogs?: boolean;
	logDirectory?: string;
	includeTimestamps?: boolean;
	logRotation?: Partial<LogRotationConfig>;
}

interface InternalLoggerConfig extends Required<Omit<LoggerConfig, "logRotation">> {
	logRotation: LogRotationConfig;
}

interface LogStats {
	size: number;
	sizeFormatted: string;
	modified: Date | null;
}

class Logger {
	public config: InternalLoggerConfig;
	public logFiles: Record<string, string>;
	public currentLogSizes: Record<string, number>;
	private initialized: boolean;

	/**
	 * Create a new Logger instance.
	 * @param config - Logger configuration.
	 */
	constructor(config: LoggerConfig = {}) {
		this.config = {
			verbose: config.verbose || false,
			diagnosticsLevel: config.diagnosticsLevel || "minimal",
			outputFormat: config.outputFormat || "pretty",
			saveErrorLogs: config.saveErrorLogs !== false,
			logDirectory: config.logDirectory || "./logs",
			includeTimestamps: config.includeTimestamps !== false,
			logRotation: {
				enabled: config.logRotation?.enabled !== false,
				maxFiles: config.logRotation?.maxFiles || 5,
				maxSize: this.parseSize(config.logRotation?.maxSize || "10MB"),
			},
		};

		this.logFiles = {
			error: path.join(this.config.logDirectory, "errors.log"),
			warning: path.join(this.config.logDirectory, "warnings.log"),
			info: path.join(this.config.logDirectory, "info.log"),
			debug: path.join(this.config.logDirectory, "debug.log"),
		};

		this.currentLogSizes = {};
		this.initialized = false;
	}

	/**
	 * Initialize logger (create directories, check rotation).
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Create log directory if it doesn't exist
			if (this.config.saveErrorLogs) {
				await fsPromises.mkdir(this.config.logDirectory, { recursive: true });

				// Check log rotation for existing files
				if (this.config.logRotation.enabled) {
					await this.checkAndRotateLogs();
				}
			}

			this.initialized = true;
		} catch (error: any) {
			console.warn(`Logger initialization warning: ${error.message}`);
		}
	}

	/**
	 * Parse size string (e.g., "10MB") to bytes.
	 * @param sizeStr - Size string to parse.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parseSize(sizeStr: any): number {
		if (typeof sizeStr === "number") return sizeStr;
		if (typeof sizeStr !== "string") return 10 * 1024 * 1024;

		const units: Record<string, number> = {
			B: 1,
			KB: 1024,
			MB: 1024 * 1024,
			GB: 1024 * 1024 * 1024,
		};

		const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
		if (!match) return 10 * 1024 * 1024; // Default 10MB

		const [, size, unit] = match;
		return parseFloat(size) * (units[unit.toUpperCase()] || 1);
	}

	/**
	 * Check and rotate logs if needed.
	 */
	async checkAndRotateLogs(): Promise<void> {
		for (const [level, logPath] of Object.entries(this.logFiles)) {
			try {
				const stats = await fsPromises.stat(logPath);
				this.currentLogSizes[level] = stats.size;

				if (stats.size >= this.config.logRotation.maxSize) {
					await this.rotateLog(logPath);
				}
			} catch (error: any) {
				console.warn(`Log rotation failed for ${logPath}: ${error.message}`);
				this.currentLogSizes[level] = 0;
			}
		}
	}

	/**
	 * Rotate a log file.
	 * @param logPath - Path to the log file.
	 */
	async rotateLog(logPath: string): Promise<void> {
		try {
			const dir = path.dirname(logPath);
			const basename = path.basename(logPath, ".log");
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

			// Rename current log
			const archivedPath = path.join(dir, `${basename}.${timestamp}.log`);
			await fsPromises.rename(logPath, archivedPath);

			// Clean up old logs if exceeding maxFiles
			await this.cleanupOldLogs(dir, basename);

			// Reset size tracker
			const level = Object.keys(this.logFiles).find((key) => this.logFiles[key] === logPath);
			if (level) {
				this.currentLogSizes[level] = 0;
			}
		} catch (error: any) {
			console.warn(`Log rotation failed for ${logPath}: ${error.message}`);
		}
	}

	/**
	 * Clean up old log files.
	 * @param dir - Directory containing log files.
	 * @param basename - Basename of the log file.
	 */
	async cleanupOldLogs(dir: string, basename: string): Promise<void> {
		try {
			const files = await fsPromises.readdir(dir);
			const logFiles = files
				.filter((file) => file.startsWith(basename) && file.endsWith(".log"))
				.map((file) => ({
					name: file,
					path: path.join(dir, file),
				}));

			// Sort by modification time
			const fileStats = await Promise.all(
				logFiles.map(async (file) => ({
					...file,
					stats: await fsPromises.stat(file.path),
				}))
			);

			fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

			// Delete oldest files if exceeding maxFiles
			if (fileStats.length > this.config.logRotation.maxFiles) {
				const filesToDelete = fileStats.slice(this.config.logRotation.maxFiles);

				for (const file of filesToDelete) {
					await fsPromises.unlink(file.path);
				}
			}
		} catch (error: any) {
			console.warn(`Cleanup old logs failed: ${error.message}`);
		}
	}

	/**
	 * Format log message.
	 * @param level - Log level.
	 * @param message - Log message.
	 * @param data - Additional data to log.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	formatMessage(level: string, message: string, data: any = null): string {
		const timestamp = this.config.includeTimestamps ? new Date().toISOString() : null;

		switch (this.config.outputFormat) {
			case "json":
				return JSON.stringify({
					timestamp,
					level,
					message,
					data,
				});

			case "simple":
				return `[${level.toUpperCase()}] ${message}`;

			case "pretty":
			default: {
				const timeStr = timestamp ? `[${timestamp}] ` : "";
				const levelStr = `[${level.toUpperCase()}]`;
				const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : "";
				return `${timeStr}${levelStr} ${message}${dataStr}`;
			}
		}
	}

	/**
	 * Write to log file.
	 * @param level - Log level.
	 * @param message - Log message.
	 * @param data - Additional data to log.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async writeToFile(level: string, message: string, data: any = null): Promise<void> {
		if (!this.config.saveErrorLogs) return;

		await this.initialize();

		const logPath = this.logFiles[level];
		if (!logPath) return;

		try {
			const formattedMessage = this.formatMessage(level, message, data);
			const logEntry = `${formattedMessage}\n`;

			await fsPromises.appendFile(logPath, logEntry, "utf8");

			// Update size tracker
			this.currentLogSizes[level] = (this.currentLogSizes[level] || 0) + logEntry.length;

			// Check if rotation is needed
			if (
				this.config.logRotation.enabled &&
				this.currentLogSizes[level] >= this.config.logRotation.maxSize
			) {
				await this.rotateLog(logPath);
			}
		} catch (error: any) {
			console.warn(`Failed to write to log file: ${error.message}`);
		}
	}

	/**
	 * Simple console log with debug awareness.
	 * @param message - Message to log
	 * @param debugOnly - Only log if debug mode is enabled
	 */
	async log(message: string, debugOnly = false): Promise<void> {
		if (debugOnly && !this.config.verbose && !process.env.DEBUG) {
			return;
		}
		console.log(message);
	}

	/**
	 * Log error.
	 * @param message - Error message.
	 * @param data - Additional data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async error(message: string, data: any = null): Promise<void> {
		console.error(`ERROR: ${message}`);
		if (data && this.config.verbose) {
			console.error(data);
		}
		await this.writeToFile("error", message, data);
	}

	/**
	 * Log warning.
	 * @param message - Warning message.
	 * @param data - Additional data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async warn(message: string, data: any = null): Promise<void> {
		console.warn(`WARNING: ${message}`);
		if (data && this.config.verbose) {
			console.warn(data);
		}
		await this.writeToFile("warning", message, data);
	}

	/**
	 * Log info.
	 * @param message - Info message.
	 * @param data - Additional data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async info(message: string, data: any = null): Promise<void> {
		if (this.config.diagnosticsLevel !== "minimal" || this.config.verbose) {
			console.log(`INFO: ${message}`);
			if (data && this.config.verbose) {
				console.log(data);
			}
		}
		await this.writeToFile("info", message, data);
	}

	/**
	 * Log debug.
	 * @param message - Debug message.
	 * @param data - Additional data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async debug(message: string, data: any = null): Promise<void> {
		if (this.config.verbose || this.config.diagnosticsLevel === "detailed") {
			console.log(`DEBUG: ${message}`);
			if (data) {
				console.log(data);
			}
		}
		await this.writeToFile("debug", message, data);
	}

	/**
	 * Log based on diagnostics level.
	 * @param level - Log level.
	 * @param message - Log message.
	 * @param data - Additional data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async diagnostics(level: string, message: string, data: any = null): Promise<void> {
		const levels: Record<string, number> = {
			minimal: 1,
			normal: 2,
			detailed: 3,
		};

		const currentLevel = levels[this.config.diagnosticsLevel] || 1;
		const messageLevel = levels[level] || 2;

		if (messageLevel <= currentLevel) {
			await this.info(message, data);
		}
	}

	/**
	 * Get log statistics.
	 * @returns Object containing log stats.
	 */
	async getLogStats(): Promise<Record<string, LogStats>> {
		const stats: Record<string, LogStats> = {};

		for (const [level, logPath] of Object.entries(this.logFiles)) {
			try {
				const fileStats = await fsPromises.stat(logPath);
				stats[level] = {
					size: fileStats.size,
					sizeFormatted: this.formatSize(fileStats.size),
					modified: fileStats.mtime,
				};
			} catch (error: any) {
				console.warn(`Failed to get stats for ${logPath}: ${error.message}`);
				stats[level] = {
					size: 0,
					sizeFormatted: "0 B",
					modified: null,
				};
			}
		}

		return stats;
	}

	/**
	 * Format size to human-readable.
	 * @param bytes - Size in bytes.
	 */
	formatSize(bytes: number): string {
		const units = ["B", "KB", "MB", "GB"];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}

	/**
	 * Clear all logs.
	 */
	async clearLogs(): Promise<void> {
		for (const logPath of Object.values(this.logFiles)) {
			try {
				await fsPromises.unlink(logPath);
			} catch (error: any) {
				console.warn(`Failed to clear log ${logPath}: ${error.message}`);
			}
		}

		this.currentLogSizes = {};
	}
}

// Create singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(config: LoggerConfig | null = null): Logger {
	if (!loggerInstance || config) {
		loggerInstance = new Logger(config || {});
	}
	return loggerInstance;
}

/**
 * Quick debug-aware logging helper.
 * @param message - Message to log.
 * @param debugOnly - Only log in debug/verbose mode.
 */
export function log(message: string, debugOnly = false): void {
	if (debugOnly && !process.env.DEBUG && !process.env.VERBOSE) {
		return;
	}
	console.log(message);
}

export default Logger;
