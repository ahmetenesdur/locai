/**
 * Advanced Logging System
 * Implements saveErrorLogs, logDirectory, logRotation, and other logging features
 */

import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";

class Logger {
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
	 * Initialize logger (create directories, check rotation)
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
	 * Parse size string (e.g., "10MB") to bytes
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
	 * Check and rotate logs if needed
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
				// File doesn't exist yet, that's fine
				this.currentLogSizes[level] = 0;
			}
		}
	}

	/**
	 * Rotate a log file
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
	 * Clean up old log files
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
	 * Format log message
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
			default:
				const timeStr = timestamp ? `[${timestamp}] ` : "";
				const levelStr = `[${level.toUpperCase()}]`;
				const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : "";
				return `${timeStr}${levelStr} ${message}${dataStr}`;
		}
	}

	/**
	 * Write to log file
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
	 * Simple console log with debug awareness
	 * @param {string} message - Message to log
	 * @param {boolean} debugOnly - Only log if debug mode is enabled
	 */
	async log(message, debugOnly = false) {
		if (debugOnly && !this.config.verbose && !process.env.DEBUG) {
			return;
		}
		console.log(message);
	}

	/**
	 * Log error
	 */
	async error(message, data = null) {
		console.error(`ERROR: ${message}`);
		if (data && this.config.verbose) {
			console.error(data);
		}
		await this.writeToFile("error", message, data);
	}

	/**
	 * Log warning
	 */
	async warn(message, data = null) {
		console.warn(`WARNING: ${message}`);
		if (data && this.config.verbose) {
			console.warn(data);
		}
		await this.writeToFile("warning", message, data);
	}

	/**
	 * Log info
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
	 * Log debug
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
	 * Log based on diagnostics level
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
	 * Get log statistics
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
	 * Format size to human-readable
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
	 * Clear all logs
	 */
	async clearLogs() {
		for (const logPath of Object.values(this.logFiles)) {
			try {
				await fsPromises.unlink(logPath);
			} catch (error) {
				// Ignore if file doesn't exist
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
 * Quick debug-aware logging helper
 * @param {string} message - Message to log
 * @param {boolean} debugOnly - Only log in debug/verbose mode
 */
export function log(message, debugOnly = false) {
	if (debugOnly && !process.env.DEBUG && !process.env.VERBOSE) {
		return;
	}
	console.log(message);
}

export default Logger;
