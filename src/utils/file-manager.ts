import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";

export interface FileOptions {
	atomic?: boolean;
	createMissingDirs?: boolean;
	backupFiles?: boolean;
	backupDir?: string;
	encoding?: BufferEncoding;
	jsonIndent?: number;
	compact?: boolean;
	indent?: number;
}

export interface ValidationResult {
	valid: boolean;
	filePath?: string;
	error?: string;
	position?: {
		position: number | null;
		line: number | null;
	} | null;
	key?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value?: any;
}

/**
 * FileManager - Modern asynchronous file operations
 * This is the preferred class for all file operations.
 */
class FileManager {
	/**
	 * Default options for file operations
	 */
	static defaultOptions: Required<Omit<FileOptions, "compact" | "indent">> = {
		atomic: true,
		createMissingDirs: true,
		backupFiles: true,
		backupDir: "./backups",
		encoding: "utf8",
		jsonIndent: 4,
	};

	private static options: FileOptions | null = null;

	/**
	 * Configure global options for file operations
	 * @param options - File operation options
	 */
	static configure(options: FileOptions): void {
		if (!options) return;

		this.options = {
			...this.defaultOptions,
			...options,
		};
	}

	/**
	 * Get current configuration
	 * @returns Current configuration
	 */
	static getConfig(): FileOptions {
		return this.options || this.defaultOptions;
	}

	/**
	 * Find locale files in the specified directory
	 * @param localesDir - Directory containing locale files
	 * @param sourceLang - Source language code
	 * @returns Array of file paths
	 */
	static async findLocaleFiles(localesDir: string, sourceLang: string): Promise<string[]> {
		try {
			const sourceFile = path.join(localesDir, `${sourceLang}.json`);

			// Check if source file exists
			await fs.access(sourceFile);
			return [sourceFile];
		} catch (err: any) {
			throw new Error(`Source language file not found: ${err.message}`);
		}
	}

	/**
	 * Read JSON file asynchronously
	 * @param filePath - Path to the JSON file
	 * @param options - Options for reading
	 * @returns Parsed JSON data
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async readJSON(filePath: string, options: FileOptions = {}): Promise<any> {
		const config = { ...this.getConfig(), ...options };

		try {
			const content = await fs.readFile(filePath, config.encoding);
			return JSON.parse(content as string);
		} catch (err: any) {
			throw new Error(`File read error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Generate a unique temporary file path to prevent collisions
	 * @param filePath - Original file path
	 * @returns Unique temporary file path
	 */
	static _generateTempFilePath(filePath: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		return `${filePath}.tmp.${timestamp}.${random}`;
	}

	/**
	 * Write data to JSON file asynchronously
	 * @param filePath - Path to write the file
	 * @param data - Data to write
	 * @param options - Options for writing
	 * @returns Success status
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async writeJSON(
		filePath: string,
		data: any,
		options: FileOptions = {}
	): Promise<boolean> {
		const config = { ...this.getConfig(), ...options };

		try {
			// Create target directory if it doesn't exist
			const dir = path.dirname(filePath);
			if (config.createMissingDirs) {
				await this.ensureDir(dir);
			}

			// Create backup directory if needed
			if (config.backupFiles && config.backupDir) {
				await this.ensureDir(config.backupDir);
			}

			// Create backup of existing file if it exists and backups are enabled
			if (config.backupFiles && config.backupDir) {
				try {
					await fs.access(filePath);
					const backupPath = path.join(
						config.backupDir,
						`${path.basename(filePath)}.${Date.now()}.bak`
					);
					await fs.copyFile(filePath, backupPath);
				} catch (err: any) {
					console.error(`Backup failed (${filePath}): ${err.message}`);
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
				} catch (renameError: any) {
					if (tempFileCreated) {
						try {
							await fs.unlink(tempFile);
						} catch (cleanupError: any) {
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
		} catch (err: any) {
			const operation = config.atomic ? "atomic write" : "direct write";
			throw new Error(`File ${operation} error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Ensure directory exists, create it if it doesn't
	 * @param dir - Directory path
	 */
	static async ensureDir(dir: string): Promise<void> {
		try {
			await fs.mkdir(dir, { recursive: true });
		} catch (err: any) {
			if (err.code !== "EEXIST") {
				throw err;
			}
		}
	}

	/**
	 * Scan for locale files with pattern matching
	 * @param localesDir - Directory to scan
	 * @param pattern - File pattern to match
	 * @returns Array of matching file paths
	 */
	static async scanLocaleFiles(localesDir: string, pattern = /\.json$/): Promise<string[]> {
		try {
			const files = await fs.readdir(localesDir);
			return files
				.filter((file) => pattern.test(file))
				.map((file) => path.join(localesDir, file));
		} catch (err: any) {
			throw new Error(`Error scanning locale directory: ${err.message}`);
		}
	}

	/**
	 * Get file modification time
	 * @param filePath - Path to the file
	 * @returns Modification time
	 */
	static async getModifiedTime(filePath: string): Promise<Date> {
		try {
			const stats = await fs.stat(filePath);
			return stats.mtime;
		} catch (err: any) {
			throw new Error(`Error getting file stats: ${err.message}`);
		}
	}

	/**
	 * Check if file exists
	 * @param filePath - Path to the file
	 * @returns True if exists
	 */
	static async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Delete file
	 * @param filePath - Path to the file
	 * @param options - Options for deletion
	 * @returns Success status
	 */
	static async deleteFile(filePath: string, options: FileOptions = {}): Promise<boolean> {
		const config = { ...this.getConfig(), ...options };

		try {
			// Create backup before deletion if backups are enabled
			if (config.backupFiles && config.backupDir) {
				try {
					await fs.access(filePath);
					await this.ensureDir(config.backupDir);
					const backupPath = path.join(
						config.backupDir,
						`${path.basename(filePath)}.deleted.${Date.now()}.bak`
					);
					await fs.copyFile(filePath, backupPath);
				} catch (err: any) {
					console.error(`Backup failed (${filePath}): ${err.message}`);
				}
			}

			await fs.unlink(filePath);
			return true;
		} catch (err: any) {
			throw new Error(`File deletion error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Validate JSON file structure
	 * @param filePath - Path to the JSON file
	 * @returns Validation result
	 */
	static async validateJSONFile(filePath: string): Promise<ValidationResult> {
		try {
			const content = await fs.readFile(filePath, "utf8");
			JSON.parse(content); // Throws if invalid
			return {
				valid: true,
				filePath,
			};
		} catch (error: any) {
			return {
				valid: false,
				filePath,
				error: error.message,
				position: this._extractErrorPosition(error),
			};
		}
	}

	/**
	 * Extract error position from JSON parse error
	 * @param error - JSON parse error
	 * @returns Error position details
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static _extractErrorPosition(
		error: any
	): { position: number | null; line: number | null } | null {
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
	 * @param key - Translation key
	 * @param value - Translation value
	 * @returns Validation result
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static validateTranslationValue(key: string, value: any): ValidationResult {
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
		} catch (error: any) {
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
	 * @param dirPath - Directory path
	 * @returns Array of file paths
	 */
	static async listFiles(dirPath: string): Promise<string[]> {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });

			const files = entries
				.filter((entry) => entry.isFile())
				.map((entry) => path.join(dirPath, entry.name));

			return files;
		} catch (err: any) {
			throw new Error(`Directory read error (${dirPath}): ${err.message}`);
		}
	}

	/**
	 * Ensure directory exists, create if it doesn't
	 * @param dirPath - Directory path
	 * @returns True if directory exists or was created
	 */
	static async ensureDirectoryExists(dirPath: string): Promise<boolean> {
		try {
			await fs.mkdir(dirPath, { recursive: true });
			return true;
		} catch (err: any) {
			throw new Error(`Failed to create directory (${dirPath}): ${err.message}`);
		}
	}
}

// Initialize options with defaults
FileManager.configure({});

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
	static defaultOptions: Required<Omit<FileOptions, "compact" | "indent">> = {
		atomic: false,
		createMissingDirs: true,
		backupFiles: true,
		backupDir: "./backups",
		encoding: "utf8",
		jsonIndent: 4,
	};

	private static options: FileOptions | null = null;

	/**
	 * Configure global options for file operations
	 * @param options - File operation options
	 * @deprecated Use FileManager.configure() instead for non-blocking operations
	 */
	static configure(options: FileOptions): void {
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
	 * @returns Current configuration
	 * @deprecated Use FileManager.getConfig() instead
	 */
	static getConfig(): FileOptions {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager is deprecated. Use async FileManager for better performance."
		);
		return this.options || this.defaultOptions;
	}

	/**
	 * Find locale files in the specified directory (sync)
	 * @param localesDir - Directory containing locale files
	 * @param sourceLang - Source language code
	 * @returns Array of file paths
	 * @deprecated Use FileManager.findLocaleFiles() instead for non-blocking operations
	 */
	static findLocaleFiles(localesDir: string, sourceLang: string): string[] {
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
	 * @param filePath - Path to the JSON file
	 * @param options - Options for reading
	 * @returns Parsed JSON data
	 * @deprecated Use FileManager.readJSON() instead for non-blocking operations
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static readJSON(filePath: string, options: FileOptions = {}): any {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.readJSON() is deprecated. Use async FileManager.readJSON() for better performance."
		);

		const config = { ...this.getConfig(), ...options };

		try {
			return JSON.parse(fsSync.readFileSync(filePath, config.encoding) as string);
		} catch (err: any) {
			throw new Error(`File read error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Write data to JSON file synchronously
	 * @param filePath - Path to write the file
	 * @param data - Data to write
	 * @param options - Options for writing
	 * @returns Success status
	 * @deprecated Use FileManager.writeJSON() instead for non-blocking operations
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static writeJSON(filePath: string, data: any, options: FileOptions = {}): boolean {
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
			if (config.backupFiles && config.backupDir && !fsSync.existsSync(config.backupDir)) {
				fsSync.mkdirSync(config.backupDir, { recursive: true });
			}

			// Create backup of existing file if it exists and backups are enabled
			if (config.backupFiles && config.backupDir && fsSync.existsSync(filePath)) {
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
		} catch (err: any) {
			throw new Error(`File write error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Check if file exists synchronously
	 * @param filePath - Path to the file
	 * @returns True if exists
	 */
	static exists(filePath: string): boolean {
		return fsSync.existsSync(filePath);
	}

	/**
	 * Delete file synchronously
	 * @param filePath - Path to the file
	 * @param options - Options for deletion
	 * @returns Success status
	 * @deprecated Use FileManager.deleteFile() instead for non-blocking operations
	 */
	static deleteFile(filePath: string, options: FileOptions = {}): boolean {
		console.warn(
			"DEPRECATION WARNING: SyncFileManager.deleteFile() is deprecated. Use async FileManager.deleteFile() for better performance."
		);

		const config = { ...this.getConfig(), ...options };

		try {
			// Create backup before deletion if backups are enabled
			if (config.backupFiles && config.backupDir && fsSync.existsSync(filePath)) {
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
		} catch (err: any) {
			throw new Error(`File deletion error (${filePath}): ${err.message}`);
		}
	}
}

export { FileManager, SyncFileManager };
