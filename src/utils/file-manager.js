import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";

/**
 * FileManager - Modern asynchronous file operations
 * This is the preferred class for all file operations.
 */
class FileManager {
	/**
	 * Default options for file operations
	 */
	static defaultOptions = {
		atomic: true, // Use atomic file operations
		createMissingDirs: true, // Create missing directories
		backupFiles: true, // Create backups before modifying
		backupDir: "./backups", // Backup directory
		encoding: "utf8", // File encoding
		jsonIndent: 4, // JSON indentation spaces
	};

	/**
	 * Configure global options for file operations
	 * @param {Object} options - File operation options
	 */
	static configure(options) {
		if (!options) return;

		this.options = {
			...this.defaultOptions,
			...options,
		};
	}

	/**
	 * Get current configuration
	 * @returns {Object} - Current configuration
	 */
	static getConfig() {
		return this.options || this.defaultOptions;
	}

	/**
	 * Find locale files in the specified directory
	 * @param {string} localesDir - Directory containing locale files
	 * @param {string} sourceLang - Source language code
	 * @returns {Promise<string[]>} - Array of file paths
	 */
	static async findLocaleFiles(localesDir, sourceLang) {
		try {
			const sourceFile = path.join(localesDir, `${sourceLang}.json`);

			// Check if source file exists
			await fs.access(sourceFile);
			return [sourceFile];
		} catch (err) {
			throw new Error(`Source language file not found: ${err.message}`);
		}
	}

	/**
	 * Read JSON file asynchronously
	 * @param {string} filePath - Path to the JSON file
	 * @param {Object} options - Options for reading
	 * @returns {Promise<Object>} - Parsed JSON data
	 */
	static async readJSON(filePath, options = {}) {
		const config = { ...this.getConfig(), ...options };

		try {
			const content = await fs.readFile(filePath, config.encoding);
			return JSON.parse(content);
		} catch (err) {
			throw new Error(`File read error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Generate a unique temporary file path to prevent collisions
	 * @param {string} filePath - Original file path
	 * @returns {string} - Unique temporary file path
	 */
	static _generateTempFilePath(filePath) {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		return `${filePath}.tmp.${timestamp}.${random}`;
	}

	/**
	 * Write data to JSON file asynchronously
	 * @param {string} filePath - Path to write the file
	 * @param {Object} data - Data to write
	 * @param {Object} options - Options for writing
	 * @returns {Promise<boolean>} - Success status
	 */
	static async writeJSON(filePath, data, options = {}) {
		const config = { ...this.getConfig(), ...options };

		try {
			// Create target directory if it doesn't exist
			const dir = path.dirname(filePath);
			if (config.createMissingDirs) {
				await this.ensureDir(dir);
			}

			// Create backup directory if needed
			if (config.backupFiles) {
				await this.ensureDir(config.backupDir);
			}

			// Create backup of existing file if it exists and backups are enabled
			if (config.backupFiles) {
				try {
					await fs.access(filePath);
					const backupPath = path.join(
						config.backupDir,
						`${path.basename(filePath)}.${Date.now()}.bak`
					);
					await fs.copyFile(filePath, backupPath);
				} catch (err) {
					// File doesn't exist, no need to backup
				}
			}

			// Format JSON with optional formatting
			const jsonString = JSON.stringify(
				data,
				null,
				config.compact ? 0 : options.indent || config.jsonIndent
			);

			// Use atomic write if configured
			if (config.atomic) {
				const tempFile = this._generateTempFilePath(filePath);
				let tempFileCreated = false;

				try {
					// Write to temporary file first
					await fs.writeFile(tempFile, jsonString, config.encoding);
					tempFileCreated = true;

					// Atomically replace the target file
					await fs.rename(tempFile, filePath);

					// Success - temp file has been renamed, no cleanup needed
					tempFileCreated = false;
				} catch (renameError) {
					if (tempFileCreated) {
						try {
							await fs.unlink(tempFile);
						} catch (cleanupError) {
							// Log cleanup failure but don't throw - original error is more important
							console.warn(
								`Warning: Failed to clean up temporary file ${tempFile}: ${cleanupError.message}`
							);
						}
					}

					// Re-throw the original error with better context
					throw new Error(
						`Atomic write failed during rename operation (${filePath}): ${renameError.message}. ` +
							`Temp file cleanup ${tempFileCreated ? "attempted" : "not needed"}.`
					);
				}
			} else {
				// Direct write
				await fs.writeFile(filePath, jsonString, config.encoding);
			}

			return true;
		} catch (err) {
			const operation = config.atomic ? "atomic write" : "direct write";
			throw new Error(`File ${operation} error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Ensure directory exists, create it if it doesn't
	 * @param {string} dir - Directory path
	 * @returns {Promise<void>}
	 */
	static async ensureDir(dir) {
		try {
			await fs.mkdir(dir, { recursive: true });
		} catch (err) {
			if (err.code !== "EEXIST") {
				throw err;
			}
		}
	}

	/**
	 * Scan for locale files with pattern matching
	 * @param {string} localesDir - Directory to scan
	 * @param {RegExp} pattern - File pattern to match
	 * @returns {Promise<string[]>} - Array of matching file paths
	 */
	static async scanLocaleFiles(localesDir, pattern = /\.json$/) {
		try {
			const files = await fs.readdir(localesDir);
			return files
				.filter((file) => pattern.test(file))
				.map((file) => path.join(localesDir, file));
		} catch (err) {
			throw new Error(`Error scanning locale directory: ${err.message}`);
		}
	}

	/**
	 * Get file modification time
	 * @param {string} filePath - Path to the file
	 * @returns {Promise<Date>} - Modification time
	 */
	static async getModifiedTime(filePath) {
		try {
			const stats = await fs.stat(filePath);
			return stats.mtime;
		} catch (err) {
			throw new Error(`Error getting file stats: ${err.message}`);
		}
	}

	/**
	 * Check if file exists
	 * @param {string} filePath - Path to the file
	 * @returns {Promise<boolean>} - True if exists
	 */
	static async exists(filePath) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Delete file
	 * @param {string} filePath - Path to the file
	 * @param {Object} options - Options for deletion
	 * @returns {Promise<boolean>} - Success status
	 */
	static async deleteFile(filePath, options = {}) {
		const config = { ...this.getConfig(), ...options };

		try {
			// Create backup before deletion if backups are enabled
			if (config.backupFiles) {
				try {
					await fs.access(filePath);
					await this.ensureDir(config.backupDir);
					const backupPath = path.join(
						config.backupDir,
						`${path.basename(filePath)}.deleted.${Date.now()}.bak`
					);
					await fs.copyFile(filePath, backupPath);
				} catch (err) {
					// File doesn't exist or other error, can't backup
				}
			}

			await fs.unlink(filePath);
			return true;
		} catch (err) {
			throw new Error(`File deletion error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Validate JSON file structure
	 * @param {string} filePath - Path to the JSON file
	 * @returns {Promise<Object>} - Validation result
	 */
	static async validateJSONFile(filePath) {
		try {
			const content = await fs.readFile(filePath, "utf8");
			JSON.parse(content); // Throws if invalid
			return {
				valid: true,
				filePath,
			};
		} catch (error) {
			return {
				valid: false,
				filePath,
				error: error.message,
				position: this._extractErrorPosition(error, filePath),
			};
		}
	}

	/**
	 * Extract error position from JSON parse error
	 * @param {Error} error - JSON parse error
	 * @param {string} filePath - Path to the file
	 * @returns {Object|null} - Error position details
	 */
	static _extractErrorPosition(error, filePath) {
		const message = error.message;
		const positionMatch = message.match(/position (\d+)/);
		const lineMatch = message.match(/line (\d+)/);

		if (positionMatch || lineMatch) {
			return {
				position: positionMatch ? parseInt(positionMatch[1]) : null,
				line: lineMatch ? parseInt(lineMatch[1]) : null,
			};
		}

		return null;
	}

	/**
	 * Validate translation value can be safely added to JSON
	 * @param {string} key - Translation key
	 * @param {any} value - Translation value
	 * @returns {Object} - Validation result
	 */
	static validateTranslationValue(key, value) {
		try {
			// Test if value can be part of valid JSON
			const testObject = { [key]: value };
			JSON.stringify(testObject);
			JSON.parse(JSON.stringify(testObject)); // Round-trip test
			return {
				valid: true,
				key,
				value,
			};
		} catch (error) {
			return {
				valid: false,
				key,
				value,
				error: `JSON validation failed: ${error.message}`,
			};
		}
	}

	/**
	 * List files in a directory
	 * @param {string} dirPath - Directory path
	 * @param {Object} options - Options for listing
	 * @returns {Promise<string[]>} - Array of file paths
	 */
	static async listFiles(dirPath, options = {}) {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });

			const files = entries
				.filter((entry) => entry.isFile())
				.map((entry) => path.join(dirPath, entry.name));

			return files;
		} catch (err) {
			throw new Error(`Directory read error (${dirPath}): ${err.message}`);
		}
	}

	/**
	 * Ensure directory exists, create if it doesn't
	 * @param {string} dirPath - Directory path
	 * @returns {Promise<boolean>} - True if directory exists or was created
	 */
	static async ensureDirectoryExists(dirPath) {
		try {
			await fs.mkdir(dirPath, { recursive: true });
			return true;
		} catch (err) {
			throw new Error(`Failed to create directory (${dirPath}): ${err.message}`);
		}
	}
}

// Initialize options with defaults
FileManager.options = { ...FileManager.defaultOptions };

/**
 * SyncFileManager - Synchronous file operations
 * Used for backward compatibility. New code should use FileManager instead.
 * @deprecated Use the async FileManager for better performance
 * PERFORMANCE WARNING: This class blocks the event loop and should be avoided
 */
class SyncFileManager {
	/**
	 * Default options for file operations
	 */
	static defaultOptions = {
		atomic: false, // Atomic operations not supported in sync mode
		createMissingDirs: true, // Create missing directories
		backupFiles: true, // Create backups before modifying
		backupDir: "./backups", // Backup directory
		encoding: "utf8", // File encoding
		jsonIndent: 4, // JSON indentation spaces
	};

	/**
	 * Configure global options for file operations
	 * @param {Object} options - File operation options
	 * @deprecated Use FileManager.configure() instead for non-blocking operations
	 */
	static configure(options) {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager is deprecated. Use async FileManager for better performance."
		);

		if (!options) return;

		this.options = {
			...this.defaultOptions,
			...options,
			atomic: false, // Always false for sync operations
		};
	}

	/**
	 * Get current configuration
	 * @returns {Object} - Current configuration
	 * @deprecated Use FileManager.getConfig() instead
	 */
	static getConfig() {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager is deprecated. Use async FileManager for better performance."
		);
		return this.options || this.defaultOptions;
	}

	/**
	 * Find locale files in the specified directory (sync)
	 * @param {string} localesDir - Directory containing locale files
	 * @param {string} sourceLang - Source language code
	 * @returns {string[]} - Array of file paths
	 * @deprecated Use FileManager.findLocaleFiles() instead for non-blocking operations
	 */
	static findLocaleFiles(localesDir, sourceLang) {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.findLocaleFiles() is deprecated. Use async FileManager.findLocaleFiles() for better performance."
		);

		const sourceFile = path.join(localesDir, `${sourceLang}.json`);

		if (!fsSync.existsSync(sourceFile)) {
			throw new Error(`Source language file not found: ${sourceFile}`);
		}

		return [sourceFile];
	}

	/**
	 * Read JSON file synchronously
	 * @param {string} filePath - Path to the JSON file
	 * @param {Object} options - Options for reading
	 * @returns {Object} - Parsed JSON data
	 * @deprecated Use FileManager.readJSON() instead for non-blocking operations
	 */
	static readJSON(filePath, options = {}) {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.readJSON() is deprecated. Use async FileManager.readJSON() for better performance."
		);

		const config = { ...this.getConfig(), ...options };

		try {
			return JSON.parse(fsSync.readFileSync(filePath, config.encoding));
		} catch (err) {
			throw new Error(`File read error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Write data to JSON file synchronously
	 * @param {string} filePath - Path to write the file
	 * @param {Object} data - Data to write
	 * @param {Object} options - Options for writing
	 * @returns {boolean} - Success status
	 * @deprecated Use FileManager.writeJSON() instead for non-blocking operations
	 */
	static writeJSON(filePath, data, options = {}) {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.writeJSON() is deprecated. Use async FileManager.writeJSON() for better performance."
		);

		const config = { ...this.getConfig(), ...options };

		try {
			// Create target directory if it doesn't exist
			const dir = path.dirname(filePath);
			if (config.createMissingDirs && !fsSync.existsSync(dir)) {
				fsSync.mkdirSync(dir, { recursive: true });
			}

			// Create backup directory if needed
			if (config.backupFiles && !fsSync.existsSync(config.backupDir)) {
				fsSync.mkdirSync(config.backupDir, { recursive: true });
			}

			// Create backup of existing file if it exists and backups are enabled
			if (config.backupFiles && fsSync.existsSync(filePath)) {
				const backupPath = path.join(
					config.backupDir,
					`${path.basename(filePath)}.${Date.now()}.bak`
				);
				fsSync.copyFileSync(filePath, backupPath);
			}

			// Format JSON with optional formatting
			const jsonString = JSON.stringify(
				data,
				null,
				config.compact ? 0 : options.indent || config.jsonIndent
			);

			// Write file
			fsSync.writeFileSync(filePath, jsonString, config.encoding);
			return true;
		} catch (err) {
			throw new Error(`File write error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Check if file exists synchronously
	 * @param {string} filePath - Path to the file
	 * @returns {boolean} - True if exists
	 */
	static exists(filePath) {
		return fsSync.existsSync(filePath);
	}

	/**
	 * Delete file synchronously
	 * @param {string} filePath - Path to the file
	 * @param {Object} options - Options for deletion
	 * @returns {boolean} - Success status
	 * @deprecated Use FileManager.deleteFile() instead for non-blocking operations
	 */
	static deleteFile(filePath, options = {}) {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.deleteFile() is deprecated. Use async FileManager.deleteFile() for better performance."
		);

		const config = { ...this.getConfig(), ...options };

		try {
			// Create backup before deletion if backups are enabled
			if (config.backupFiles && fsSync.existsSync(filePath)) {
				if (!fsSync.existsSync(config.backupDir)) {
					fsSync.mkdirSync(config.backupDir, { recursive: true });
				}

				const backupPath = path.join(
					config.backupDir,
					`${path.basename(filePath)}.deleted.${Date.now()}.bak`
				);
				fsSync.copyFileSync(filePath, backupPath);
			}

			fsSync.unlinkSync(filePath);
			return true;
		} catch (err) {
			throw new Error(`File deletion error (${filePath}): ${err.message}`);
		}
	}
}

// Initialize options with defaults
SyncFileManager.options = { ...SyncFileManager.defaultOptions };

export { FileManager, SyncFileManager };
