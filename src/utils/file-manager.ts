import { promises as fs } from "fs";
import path from "path";
import { FormatFactory } from "../core/adapters/factory.js";

export interface FileOptions {
	atomic?: boolean;
	createMissingDirs?: boolean;
	backupFiles?: boolean;
	backupDir?: string;
	encoding?: BufferEncoding;
	jsonIndent?: number;
	compact?: boolean;
	indent?: number;
	format?: string; // Explicit format override
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
 * Handles multiple file formats via Adapter pattern.
 */
class FileManager {
	/**
	 * Default options for file operations
	 */
	static defaultOptions: Required<Omit<FileOptions, "compact" | "indent" | "format">> = {
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
			// Find any file with the source language name (ignoring extension)
			const files = await fs.readdir(localesDir);
			const sourceFiles = files
				.filter((file) => file.startsWith(`${sourceLang}.`))
				.map((file) => path.join(localesDir, file));

			if (sourceFiles.length === 0) {
				throw new Error(
					`Source language file not found for '${sourceLang}' in ${localesDir}`
				);
			}

			// Return the first match, or maybe prioritize JSON?
			// For now, return all matches, but usually there's only one.
			return sourceFiles;
		} catch (err: any) {
			if (err.code === "ENOENT") {
				throw new Error(`Locales directory not found: ${localesDir}`);
			}
			throw new Error(`Source language file search error: ${err.message}`);
		}
	}

	/**
	 * Read structured data file asynchronously (JSON, YAML, etc.)
	 * @param filePath - Path to the file
	 * @param options - Options for reading
	 * @returns Parsed data
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async readFile(filePath: string, options: FileOptions = {}): Promise<any> {
		const config = { ...this.getConfig(), ...options };

		try {
			const content = await fs.readFile(filePath, config.encoding);
			const adapter =
				options.format && options.format !== "auto"
					? FormatFactory.getAdapterByFormat(options.format)
					: FormatFactory.getAdapter(filePath);

			return await adapter.parse(content as string);
		} catch (err: any) {
			throw new Error(`File read error (${filePath}): ${err.message}`);
		}
	}

	/**
	 * Write data to file asynchronously
	 * @param filePath - Path to write the file
	 * @param data - Data to write
	 * @param options - Options for writing
	 * @returns Success status
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async writeFile(
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

			// Create backup of existing file
			if (config.backupFiles && config.backupDir) {
				try {
					await fs.access(filePath);
					const backupPath = path.join(
						config.backupDir,
						`${path.basename(filePath)}.${Date.now()}.bak`
					);
					await fs.copyFile(filePath, backupPath);
				} catch (err: any) {
					// Ignore if file doesn't exist
					if (err.code !== "ENOENT") {
						console.error(`Backup failed (${filePath}): ${err.message}`);
					}
				}
			}

			// Serialize content
			const adapter =
				options.format && options.format !== "auto"
					? FormatFactory.getAdapterByFormat(options.format)
					: FormatFactory.getAdapter(filePath);

			const content = await adapter.serialize(data, {
				indent: options.indent || config.jsonIndent,
				compact: config.compact,
			});

			// Use atomic write if configured
			if (config.atomic) {
				const tempFile = this._generateTempFilePath(filePath);
				let tempFileCreated = false;

				try {
					await fs.writeFile(tempFile, content, config.encoding);
					tempFileCreated = true;
					await fs.rename(tempFile, filePath);
					tempFileCreated = false;
				} catch (renameError: any) {
					if (tempFileCreated) {
						try {
							await fs.unlink(tempFile);
						} catch {
							/* ignore cleanup error */
						}
					}
					throw new Error(`Atomic write failed (${filePath}): ${renameError.message}`);
				}
			} else {
				await fs.writeFile(filePath, content, config.encoding);
			}

			return true;
		} catch (err: any) {
			throw new Error(`File write error (${filePath}): ${err.message}`);
		}
	}

	// Legacy method aliases for backward compatibility
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async readJSON(filePath: string, options: FileOptions = {}): Promise<any> {
		return this.readFile(filePath, { ...options, format: "json" });
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static async writeJSON(
		filePath: string,
		data: any,
		options: FileOptions = {}
	): Promise<boolean> {
		return this.writeFile(filePath, data, { ...options, format: "json" });
	}

	/**
	 * Generate a unique temporary file path
	 */
	static _generateTempFilePath(filePath: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		return `${filePath}.tmp.${timestamp}.${random}`;
	}

	/**
	 * Ensure directory exists
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
	 * Scan for locale files
	 */
	static async scanLocaleFiles(localesDir: string, pattern = /.*/): Promise<string[]> {
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

export { FileManager };
