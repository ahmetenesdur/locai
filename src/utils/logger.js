/**
 * Advanced Logging System.
 * Implements saveErrorLogs, logDirectory, logRotation, and other logging features.
 */

import path from "path";
import { promises as fsPromises } from "fs";

class Logger {
	/**
	 * Create a new Logger instance.
	 * @param {Object} config - Logger configuration.
	 * @param {boolean} [config.verbose=false] - Enable verbose logging.
	 * @param {string} [config.diagnosticsLevel="minimal"] - Diagnostics level (minimal, normal, detailed).
	 * @param {string} [config.outputFormat="pretty"] - Output format (pretty, json, simple).
	 * @param {boolean} [config.saveErrorLogs=true] - Whether to save error logs to files.
	 * @param {string} [config.logDirectory="./logs"] - Directory to save log files.
	 * @param {boolean} [config.includeTimestamps=true] - Whether to include timestamps in logs.
	 * @param {Object} [config.logRotation] - Log rotation configuration.
	 */
	constructor(config = {}) {
		this.config = {
			verbose: config.verbose || false,
			diagnosticsLevel: config.diagnosticsLevel || "minimal", // minimal, normal, detailed
			outputFormat: config.outputFormat || "pretty", // pretty, json, simple
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
	 * @returns {Promise<void>}
	 */
	async initialize() {
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
		} catch (error) {
			console.warn(`Logger initialization warning: ${error.message}`);
		}
	}

	/**
	 * Parse size string (e.g., "10MB") to bytes.
	 * @param {string} sizeStr - Size string to parse.
	 * @returns {number} - Size in bytes.
	 */
	parseSize(sizeStr) {
		const units = {
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
	 * @returns {Promise<void>}
	 */
	async checkAndRotateLogs() {
		for (const [level, logPath] of Object.entries(this.logFiles)) {
			try {
				const stats = await fsPromises.stat(logPath);
				this.currentLogSizes[level] = stats.size;

				if (stats.size >= this.config.logRotation.maxSize) {
					await this.rotateLog(logPath);
				}
			} catch (error) {
				console.warn(`Log rotation failed for ${logPath}: ${error.message}`);
				this.currentLogSizes[level] = 0;
			}
		}
	}

	/**
	 * Rotate a log file.
	 * @param {string} logPath - Path to the log file.
	 * @returns {Promise<void>}
	 */
	async rotateLog(logPath) {
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
		} catch (error) {
			console.warn(`Log rotation failed for ${logPath}: ${error.message}`);
		}
	}

	/**
	 * Clean up old log files.
	 * @param {string} dir - Directory containing log files.
	 * @param {string} basename - Basename of the log file.
	 * @returns {Promise<void>}
	 */
	async cleanupOldLogs(dir, basename) {
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

			fileStats.sort((a, b) => b.stats.mtime - a.stats.mtime);

			// Delete oldest files if exceeding maxFiles
			if (fileStats.length > this.config.logRotation.maxFiles) {
				const filesToDelete = fileStats.slice(this.config.logRotation.maxFiles);

				for (const file of filesToDelete) {
					await fsPromises.unlink(file.path);
				}
			}
		} catch (error) {
			console.warn(`Cleanup old logs failed: ${error.message}`);
		}
	}

	/**
	 * Format log message.
	 * @param {string} level - Log level.
	 * @param {string} message - Log message.
	 * @param {any} [data=null] - Additional data to log.
	 * @returns {string} - Formatted log message.
	 */
	formatMessage(level, message, data = null) {
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
	 * @param {string} level - Log level.
	 * @param {string} message - Log message.
	 * @param {any} [data=null] - Additional data to log.
	 * @returns {Promise<void>}
	 */
	async writeToFile(level, message, data = null) {
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
		} catch (error) {
			console.warn(`Failed to write to log file: ${error.message}`);
		}
	}

	/**
	 * Simple console log with debug awareness.
	 * @param {string} message - Message to log
	 * @param {boolean} [debugOnly=false] - Only log if debug mode is enabled
	 * @returns {Promise<void>}
	 */
	async log(message, debugOnly = false) {
		if (debugOnly && !this.config.verbose && !process.env.DEBUG) {
			return;
		}
		console.log(message);
	}

	/**
	 * Log error.
	 * @param {string} message - Error message.
	 * @param {any} [data=null] - Additional data.
	 * @returns {Promise<void>}
	 */
	async error(message, data = null) {
		console.error(`ERROR: ${message}`);
		if (data && this.config.verbose) {
			console.error(data);
		}
		await this.writeToFile("error", message, data);
	}

	/**
	 * Log warning.
	 * @param {string} message - Warning message.
	 * @param {any} [data=null] - Additional data.
	 * @returns {Promise<void>}
	 */
	async warn(message, data = null) {
		console.warn(`WARNING: ${message}`);
		if (data && this.config.verbose) {
			console.warn(data);
		}
		await this.writeToFile("warning", message, data);
	}

	/**
	 * Log info.
	 * @param {string} message - Info message.
	 * @param {any} [data=null] - Additional data.
	 * @returns {Promise<void>}
	 */
	async info(message, data = null) {
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
	 * @param {string} message - Debug message.
	 * @param {any} [data=null] - Additional data.
	 * @returns {Promise<void>}
	 */
	async debug(message, data = null) {
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
	 * @param {string} level - Log level.
	 * @param {string} message - Log message.
	 * @param {any} [data=null] - Additional data.
	 * @returns {Promise<void>}
	 */
	async diagnostics(level, message, data = null) {
		const levels = {
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
	 * @returns {Promise<Object>} - Object containing log stats.
	 */
	async getLogStats() {
		const stats = {};

		for (const [level, logPath] of Object.entries(this.logFiles)) {
			try {
				const fileStats = await fsPromises.stat(logPath);
				stats[level] = {
					size: fileStats.size,
					sizeFormatted: this.formatSize(fileStats.size),
					modified: fileStats.mtime,
				};
			} catch (error) {
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
	 * @param {number} bytes - Size in bytes.
	 * @returns {string} - Formatted size string.
	 */
	formatSize(bytes) {
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
	 * @returns {Promise<void>}
	 */
	async clearLogs() {
		for (const logPath of Object.values(this.logFiles)) {
			try {
				await fsPromises.unlink(logPath);
			} catch (error) {
				console.warn(`Failed to clear log ${logPath}: ${error.message}`);
			}
		}

		this.currentLogSizes = {};
	}
}

// Create singleton instance
let loggerInstance = null;

export function getLogger(config = null) {
	if (!loggerInstance || config) {
		loggerInstance = new Logger(config);
	}
	return loggerInstance;
}

/**
 * Quick debug-aware logging helper.
 * @param {string} message - Message to log.
 * @param {boolean} [debugOnly=false] - Only log in debug/verbose mode.
 */
export function log(message, debugOnly = false) {
	if (debugOnly && !process.env.DEBUG && !process.env.VERBOSE) {
		return;
	}
	console.log(message);
}

export default Logger;
