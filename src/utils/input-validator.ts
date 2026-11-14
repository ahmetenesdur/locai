/**
 * Input validation utility for security and data integrity.
 * Defines regex patterns, limits, and validation methods.
 */

import path from "path";
import type { FileOptions } from "./file-manager.js";
import type { QualityRules } from "./quality/base-checker.js";
import type { LengthControlOptions } from "./quality/length-checker.js";

// Shapes of a configuration after validateConfig has accepted it
export interface ApiProviderConfig {
	temperature?: number;
	maxTokens?: number;
	[key: string]: unknown;
}

export interface RateLimiterProviderLimit {
	rpm?: number;
	concurrency?: number;
}

export interface RateLimiterConfig {
	queueStrategy?: "fifo" | "priority";
	queueTimeout?: number;
	providerLimits?: Record<string, RateLimiterProviderLimit>;
}

export interface RetryOptions {
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
}

export interface ContextConfig {
	aiProvider?: string;
	minTextLength?: number;
	detection?: {
		threshold?: number;
		minConfidence?: number;
	};
	categories?: Record<string, unknown>;
}

export interface QualityChecksConfig {
	rules?: QualityRules;
	enabled?: boolean;
	autoFix?: boolean;
}

export interface AdvancedConfig {
	timeoutMs?: number;
	maxKeyLength?: number;
	maxBatchSize?: number;
}

export interface AppConfig {
	source: string;
	targets: string[];
	localesDir: string;
	apiProvider?: string;
	fallbackOrder?: string[];
	concurrencyLimit?: number;
	cacheSize?: number;
	cacheTTL?: number;
	apiConfig?: Record<string, ApiProviderConfig>;
	rateLimiter?: RateLimiterConfig;
	retryOptions?: RetryOptions;
	context?: ContextConfig;
	qualityChecks?: QualityChecksConfig;
	lengthControl?: LengthControlOptions;
	advanced?: AdvancedConfig;
	fileOperations?: FileOptions;
	debug?: boolean;
	verbose?: boolean;
	[key: string]: unknown;
}

/** A config section that is an object but whose fields have not been validated yet */
type UnvalidatedSection = Record<string, unknown>;

const isObject = (value: unknown): value is UnvalidatedSection =>
	typeof value === "object" && value !== null;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

class InputValidator {
	/**
	 * Well-formed BCP 47 language tag, limited to the subtags locai supports:
	 * a 2-3 letter language, an optional 4-letter script and an optional
	 * 2-letter or 3-digit region (e.g. "en", "fil", "pt-BR", "zh-Hant-TW", "es-419").
	 * Matching is case-insensitive; see validateLanguageCode for canonical casing.
	 */
	static LANGUAGE_CODE_PATTERN: RegExp = /^([a-z]{2,3})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?$/i;
	static VALID_PROVIDERS: string[] = [
		"dashscope",
		"xai",
		"openai",
		"deepseek",
		"gemini",
		"anthropic",
	];
	static MAX_TEXT_LENGTH: number = 10000;
	static MAX_KEY_LENGTH: number = 500;
	static MAX_PATH_LENGTH: number = 1000;
	static MAX_CONFIG_DEPTH: number = 10;

	/**
	 * Validate a BCP 47 language tag and return it in canonical casing:
	 * lowercase language, title-case script, uppercase region
	 * (e.g. "ZH-hant-tw" -> "zh-Hant-TW", "PT-br" -> "pt-BR").
	 * @param {unknown} langCode - Language tag to validate.
	 * @param {string} [paramName="language"] - Parameter name for error messages.
	 * @returns {string} - Canonical language tag.
	 * @throws {Error} If validation fails.
	 */
	static validateLanguageCode(langCode: unknown, paramName: string = "language"): string {
		if (!langCode || typeof langCode !== "string") {
			throw new Error(`${paramName} must be a non-empty string`);
		}

		const trimmed = langCode.trim();

		if (trimmed.length === 0) {
			throw new Error(`${paramName} cannot be empty after trimming`);
		}

		if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
			throw new Error(`${paramName} code contains forbidden characters: '${langCode}'`);
		}

		const match = this.LANGUAGE_CODE_PATTERN.exec(trimmed);
		if (!match) {
			throw new Error(
				`Invalid ${paramName} code: '${langCode}'. Expected a BCP 47 language tag such as 'en', 'fil', 'pt-BR', 'zh-Hant' or 'es-419'`
			);
		}

		const [, language, script, region] = match;
		let canonical = language.toLowerCase();
		if (script) {
			canonical += `-${script.charAt(0).toUpperCase()}${script.slice(1).toLowerCase()}`;
		}
		if (region) {
			canonical += `-${region.toUpperCase()}`;
		}

		return canonical;
	}

	/**
	 * Validate array of language codes.
	 * @param {unknown} langCodes - Array of language codes.
	 * @param {string} [paramName="languages"] - Parameter name for errors.
	 * @returns {string[]} - Sanitized array of language codes.
	 * @throws {Error} If array is empty or contains invalid codes.
	 */
	static validateLanguageCodes(langCodes: unknown, paramName: string = "languages"): string[] {
		if (!Array.isArray(langCodes)) {
			throw new Error(`${paramName} must be an array`);
		}

		if (langCodes.length === 0) {
			throw new Error(`${paramName} array cannot be empty`);
		}

		if (langCodes.length > 50) {
			throw new Error(`${paramName} array too large (max 50 languages)`);
		}

		return langCodes.map((code, index) =>
			this.validateLanguageCode(code, `${paramName}[${index}]`)
		);
	}

	/**
	 * Validate and sanitize directory path.
	 * @param {unknown} dirPath - Directory path.
	 * @param {string} [paramName="directory"] - Parameter name for errors.
	 * @returns {string} - Resolved and validated absolute path.
	 * @throws {Error} If path is invalid or outside working directory.
	 */
	static validateDirectoryPath(dirPath: unknown, paramName: string = "directory"): string {
		if (!dirPath || typeof dirPath !== "string") {
			throw new Error(`${paramName} must be a non-empty string`);
		}

		const resolved = path.resolve(dirPath);

		const cwd = process.cwd();

		if (!resolved.startsWith(cwd)) {
			throw new Error(
				`${paramName} path '${dirPath}' is outside working directory (resolved: ${resolved})`
			);
		}

		return resolved;
	}

	/**
	 * Validate translation text.
	 * @param {unknown} text - Text to validate.
	 * @param {string} [paramName="text"] - Parameter name for errors.
	 * @returns {string} - Validated text.
	 * @throws {Error} If text is invalid or too long.
	 */
	static validateText(text: unknown, paramName: string = "text"): string {
		if (text === null || text === undefined) {
			throw new Error(`${paramName} cannot be null or undefined`);
		}

		if (typeof text !== "string") {
			throw new Error(`${paramName} must be a string`);
		}

		if (text.length > this.MAX_TEXT_LENGTH) {
			throw new Error(
				`${paramName} too long (${text.length} chars, max ${this.MAX_TEXT_LENGTH})`
			);
		}

		return text;
	}

	/**
	 * Validate translation key.
	 * @param {unknown} key - Key to validate.
	 * @param {string} [paramName="key"] - Parameter name.
	 * @returns {string} - Validated key.
	 * @throws {Error} If key is invalid, too long, or contains traversal.
	 */
	static validateKey(key: unknown, paramName: string = "key"): string {
		if (!key || typeof key !== "string") {
			throw new Error(`${paramName} must be a non-empty string`);
		}

		if (key.length > this.MAX_KEY_LENGTH) {
			throw new Error(
				`${paramName} too long (${key.length} chars, max ${this.MAX_KEY_LENGTH})`
			);
		}

		if (key.includes("../") || key.includes("..\\")) {
			throw new Error(`${paramName} contains path traversal sequences: '${key}'`);
		}

		return key;
	}

	/**
	 * Validate API provider name.
	 * @param {unknown} provider - Provider name.
	 * @param {string} [fieldName="API provider"] - Parameter name.
	 * @returns {string} - Normalized provider name.
	 * @throws {Error} If provider is unknown.
	 */
	static validateProvider(provider: unknown, fieldName: string = "API provider"): string {
		if (!provider || typeof provider !== "string") {
			throw new Error(`${fieldName} must be a non-empty string`);
		}

		const normalized = provider.toLowerCase().trim();

		if (!this.VALID_PROVIDERS.includes(normalized)) {
			throw new Error(
				`Invalid ${fieldName}: '${provider}'. Valid providers: ${this.VALID_PROVIDERS.join(", ")}`
			);
		}

		return normalized;
	}

	/**
	 * Sanitize filename to prevent path traversal.
	 * @param {string} filename - Filename to sanitize.
	 * @param {string|null} [extension=null] - Optional extension to enforce.
	 * @returns {string} - Sanitized filename.
	 * @throws {Error} If filename is invalid.
	 */
	static sanitizeFilename(filename: string, extension: string | null = null): string {
		if (!filename || typeof filename !== "string") {
			throw new Error("Filename must be a non-empty string");
		}

		let sanitized = path
			.basename(filename)
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // eslint-disable-line no-control-regex -- strip ASCII control characters
			.replace(/^\.+/, "")
			.trim();

		if (!sanitized) {
			throw new Error(`Filename '${filename}' results in empty name after sanitization`);
		}

		if (extension && !sanitized.endsWith(extension)) {
			sanitized = sanitized.replace(/\.[^.]*$/, "") + extension;
		}

		return sanitized;
	}

	/**
	 * Create safe file path within a directory.
	 * @param {string} baseDir - Base directory.
	 * @param {string} filename - Filename.
	 * @returns {string} - Safe full path.
	 * @throws {Error} If path escapes base directory.
	 */
	static createSafeFilePath(baseDir: string, filename: string): string {
		const safeFilename = this.sanitizeFilename(filename);
		const fullPath = path.join(baseDir, safeFilename);

		const resolved = path.resolve(fullPath);
		const resolvedBase = path.resolve(baseDir);

		if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
			throw new Error(`Generated path '${fullPath}' is outside base directory '${baseDir}'`);
		}

		return fullPath;
	}

	/**
	 * Validate configuration object.
	 * Rewrites `source` and `targets` in place to canonical BCP 47 casing so that
	 * file lookups and per-language settings all see the same tag.
	 * @param {unknown} config - Configuration object to validate.
	 * @returns {AppConfig} - Validated configuration.
	 * @throws {Error} If configuration is invalid.
	 */
	static validateConfig(config: unknown): AppConfig {
		if (!isObject(config)) {
			throw new Error("Configuration must be an object");
		}

		// Check config depth to prevent circular references
		this.validateObjectDepth(config);

		const errors: string[] = [];
		const warnings: string[] = [];

		// Required fields validation
		if (!config.source) {
			errors.push("Missing required field 'source' (source language)");
		} else {
			try {
				config.source = this.validateLanguageCode(config.source, "source language");
			} catch (error) {
				errors.push(`Invalid source language: ${errorMessage(error)}`);
			}
		}

		if (!config.targets || !Array.isArray(config.targets) || config.targets.length === 0) {
			errors.push("Missing or empty 'targets' array (target languages)");
		} else {
			try {
				config.targets = this.validateLanguageCodes(config.targets, "target languages");
			} catch (error) {
				errors.push(`Invalid target languages: ${errorMessage(error)}`);
			}
		}

		if (!config.localesDir) {
			errors.push("Missing required field 'localesDir' (locales directory path)");
		}

		// API Provider validation
		if (config.apiProvider) {
			try {
				this.validateProvider(config.apiProvider, "API provider");
			} catch (error) {
				errors.push(`Invalid API provider: ${errorMessage(error)}`);
			}
		} else {
			warnings.push("No API provider specified, will use first available provider");
		}

		// Fallback order validation
		if (config.fallbackOrder) {
			if (!Array.isArray(config.fallbackOrder)) {
				errors.push("'fallbackOrder' must be an array");
			} else {
				for (const provider of config.fallbackOrder) {
					try {
						this.validateProvider(provider, "fallback provider");
					} catch (error) {
						errors.push(`Invalid provider in fallbackOrder: ${errorMessage(error)}`);
					}
				}
			}
		}

		// Concurrency validation
		if (config.concurrencyLimit !== undefined) {
			const limit = parseInt(String(config.concurrencyLimit));
			if (isNaN(limit) || limit < 1 || limit > 50) {
				errors.push("'concurrencyLimit' must be a number between 1 and 50");
			}
		}

		// Cache configuration validation
		if (config.cacheSize !== undefined) {
			const size = parseInt(String(config.cacheSize));
			if (isNaN(size) || size < 100 || size > 10000) {
				errors.push("'cacheSize' must be a number between 100 and 10000");
			}
		}

		if (config.cacheTTL !== undefined) {
			const ttl = parseInt(String(config.cacheTTL));
			if (isNaN(ttl) || ttl < 0) {
				errors.push("'cacheTTL' must be a non-negative number (milliseconds)");
			}
			if (ttl > 7 * 24 * 60 * 60 * 1000) {
				warnings.push("'cacheTTL' is very large (>7 days), consider reducing it");
			}
		}

		// API Config validation
		if (config.apiConfig) {
			if (!isObject(config.apiConfig)) {
				errors.push("'apiConfig' must be an object");
			} else {
				this.validateApiConfig(config.apiConfig, errors, warnings);
			}
		}

		// Rate Limiter validation
		if (config.rateLimiter) {
			if (!isObject(config.rateLimiter)) {
				errors.push("'rateLimiter' must be an object");
			} else {
				this.validateRateLimiterConfig(config.rateLimiter, errors, warnings);
			}
		}

		// Retry options validation
		if (config.retryOptions) {
			if (!isObject(config.retryOptions)) {
				errors.push("'retryOptions' must be an object");
			} else {
				this.validateRetryOptions(config.retryOptions, errors, warnings);
			}
		}

		// Context configuration validation
		if (config.context) {
			if (!isObject(config.context)) {
				errors.push("'context' must be an object");
			} else {
				this.validateContextConfig(config.context, errors, warnings);
			}
		}

		// Quality checks validation
		if (config.qualityChecks) {
			if (!isObject(config.qualityChecks)) {
				errors.push("'qualityChecks' must be an object");
			} else {
				this.validateQualityChecks(config.qualityChecks, errors, warnings);
			}
		}

		// Length control validation
		if (config.lengthControl) {
			if (!isObject(config.lengthControl)) {
				errors.push("'lengthControl' must be an object");
			} else {
				this.validateLengthControl(config.lengthControl, errors);
			}
		}

		// Advanced settings validation
		if (config.advanced) {
			if (!isObject(config.advanced)) {
				errors.push("'advanced' must be an object");
			} else {
				this.validateAdvancedConfig(config.advanced, errors);
			}
		}

		// File operations validation
		if (config.fileOperations) {
			if (typeof config.fileOperations !== "object") {
				errors.push("'fileOperations' must be an object");
			}
		}

		// Report errors and warnings
		if (errors.length > 0) {
			const errorMessage = [
				"Configuration validation failed:",
				...errors.map((err, i) => `  ${i + 1}. ${err}`),
			].join("\n");
			throw new Error(errorMessage);
		}

		if (warnings.length > 0 && (config.debug || config.verbose)) {
			console.warn("Configuration warnings:");
			warnings.forEach((warn, i) => console.warn(`  ${i + 1}. ${warn}`));
		}

		return config as AppConfig;
	}

	/**
	 * Validate API config for each provider.
	 * @param {Record<string, unknown>} apiConfig - Raw API configuration object.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateApiConfig(
		apiConfig: UnvalidatedSection,
		errors: string[],
		warnings: string[]
	): void {
		for (const [provider, rawSettings] of Object.entries(apiConfig)) {
			if (!this.VALID_PROVIDERS.includes(provider)) {
				warnings.push(`Unknown provider in apiConfig: '${provider}'`);
				continue;
			}

			if (typeof rawSettings !== "object") {
				errors.push(`apiConfig.${provider} must be an object`);
				continue;
			}
			// typeof null === "object": a null entry gets through and throws on property access
			const settings = rawSettings as UnvalidatedSection;

			// Validate temperature
			if (settings.temperature !== undefined) {
				const temp = parseFloat(String(settings.temperature));
				if (isNaN(temp) || temp < 0 || temp > 2) {
					errors.push(`apiConfig.${provider}.temperature must be between 0 and 2`);
				}
				if (temp > 0.5) {
					warnings.push(
						`apiConfig.${provider}.temperature is high (${temp}), may reduce consistency`
					);
				}
			}

			// Validate maxTokens
			if (settings.maxTokens !== undefined) {
				const tokens = parseInt(String(settings.maxTokens));
				if (isNaN(tokens) || tokens < 100 || tokens > 8000) {
					errors.push(`apiConfig.${provider}.maxTokens must be between 100 and 8000`);
				}
			}
		}
	}

	/**
	 * Validate rate limiter configuration.
	 * @param {Record<string, unknown>} rateLimiter - Raw rate limiter configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateRateLimiterConfig(
		rateLimiter: UnvalidatedSection,
		errors: string[],
		_warnings: string[]
	): void {
		if (rateLimiter.queueStrategy) {
			const validStrategies = ["fifo", "priority"];
			if (
				typeof rateLimiter.queueStrategy !== "string" ||
				!validStrategies.includes(rateLimiter.queueStrategy)
			) {
				errors.push(
					`rateLimiter.queueStrategy must be one of: ${validStrategies.join(", ")}`
				);
			}
		}

		if (rateLimiter.queueTimeout !== undefined) {
			const timeout = parseInt(String(rateLimiter.queueTimeout));
			if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
				errors.push("rateLimiter.queueTimeout must be between 1000 and 120000 ms");
			}
		}

		if (rateLimiter.providerLimits) {
			if (!isObject(rateLimiter.providerLimits)) {
				errors.push("rateLimiter.providerLimits must be an object");
			} else {
				for (const [provider, rawLimits] of Object.entries(rateLimiter.providerLimits)) {
					if (!this.VALID_PROVIDERS.includes(provider)) {
						_warnings.push(`Unknown provider in providerLimits: '${provider}'`);
						continue;
					}
					// Not checked to be an object: primitives read as undefined, null throws
					const limits = rawLimits as UnvalidatedSection;

					if (limits.rpm !== undefined) {
						const rpm = parseInt(String(limits.rpm));
						if (isNaN(rpm) || rpm < 1 || rpm > 10000) {
							errors.push(
								`rateLimiter.providerLimits.${provider}.rpm must be between 1 and 10000`
							);
						}
					}

					if (limits.concurrency !== undefined) {
						const conc = parseInt(String(limits.concurrency));
						if (isNaN(conc) || conc < 1 || conc > 50) {
							errors.push(
								`rateLimiter.providerLimits.${provider}.concurrency must be between 1 and 50`
							);
						}
					}
				}
			}
		}
	}

	/**
	 * Validate retry options.
	 * @param {Record<string, unknown>} retryOptions - Raw retry options.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateRetryOptions(
		retryOptions: UnvalidatedSection,
		errors: string[],
		_warnings: string[]
	): void {
		if (retryOptions.maxRetries !== undefined) {
			const retries = parseInt(String(retryOptions.maxRetries));
			if (isNaN(retries) || retries < 0 || retries > 10) {
				errors.push("retryOptions.maxRetries must be between 0 and 10");
			}
		}

		if (retryOptions.initialDelay !== undefined) {
			const delay = parseInt(String(retryOptions.initialDelay));
			if (isNaN(delay) || delay < 100 || delay > 10000) {
				errors.push("retryOptions.initialDelay must be between 100 and 10000 ms");
			}
		}

		if (retryOptions.maxDelay !== undefined) {
			const delay = parseInt(String(retryOptions.maxDelay));
			if (isNaN(delay) || delay < 1000 || delay > 60000) {
				errors.push("retryOptions.maxDelay must be between 1000 and 60000 ms");
			}
		}

		// Compares the raw values (numbers in a well-formed config)
		const initialDelay = retryOptions.initialDelay as number | undefined;
		const maxDelay = retryOptions.maxDelay as number | undefined;
		if (initialDelay !== undefined && maxDelay !== undefined && initialDelay > maxDelay) {
			errors.push("retryOptions.initialDelay cannot be greater than maxDelay");
		}
	}

	/**
	 * Validate context configuration.
	 * @param {Record<string, unknown>} context - Raw context configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateContextConfig(
		context: UnvalidatedSection,
		errors: string[],
		warnings: string[]
	): void {
		if (context.aiProvider) {
			try {
				this.validateProvider(context.aiProvider, "context.aiProvider");
			} catch (error) {
				errors.push(`Invalid context.aiProvider: ${errorMessage(error)}`);
			}
		}

		if (context.minTextLength !== undefined) {
			const length = parseInt(String(context.minTextLength));
			if (isNaN(length) || length < 0 || length > 1000) {
				errors.push("context.minTextLength must be between 0 and 1000");
			}
		}

		if (isObject(context.detection)) {
			if (context.detection.threshold !== undefined) {
				const threshold = parseInt(String(context.detection.threshold));
				if (isNaN(threshold) || threshold < 1 || threshold > 20) {
					errors.push("context.detection.threshold must be between 1 and 20");
				}
			}

			if (context.detection.minConfidence !== undefined) {
				const confidence = parseFloat(String(context.detection.minConfidence));
				if (isNaN(confidence) || confidence < 0 || confidence > 1) {
					errors.push("context.detection.minConfidence must be between 0 and 1");
				}
			}
		}

		if (context.categories) {
			if (typeof context.categories !== "object") {
				errors.push("context.categories must be an object");
			} else if (Object.keys(context.categories).length === 0) {
				warnings.push("context.categories is empty, context detection may not work");
			}
		}
	}

	/**
	 * Validate quality checks configuration.
	 * @param {Record<string, unknown>} qualityChecks - Raw quality checks configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateQualityChecks(
		qualityChecks: UnvalidatedSection,
		errors: string[],
		warnings: string[]
	): void {
		if (qualityChecks.rules && typeof qualityChecks.rules !== "object") {
			errors.push("qualityChecks.rules must be an object");
		}

		if (qualityChecks.enabled === false && qualityChecks.autoFix === true) {
			warnings.push("qualityChecks.autoFix is enabled but qualityChecks.enabled is false");
		}
	}

	/**
	 * Validate length control configuration.
	 * @param {Record<string, unknown>} lengthControl - Raw length control configuration.
	 * @param {string[]} errors - Array to push errors to.
	 */
	static validateLengthControl(lengthControl: UnvalidatedSection, errors: string[]): void {
		if (lengthControl.mode) {
			const validModes = ["strict", "flexible", "exact", "relaxed", "smart"];
			if (
				typeof lengthControl.mode !== "string" ||
				!validModes.includes(lengthControl.mode)
			) {
				errors.push(`lengthControl.mode must be one of: ${validModes.join(", ")}`);
			}
		}

		if (lengthControl.rules) {
			if (typeof lengthControl.rules !== "object") {
				errors.push("lengthControl.rules must be an object");
			}
		}
	}

	/**
	 * Validate advanced configuration.
	 * @param {Record<string, unknown>} advanced - Raw advanced configuration.
	 * @param {string[]} errors - Array to push errors to.
	 */
	static validateAdvancedConfig(advanced: UnvalidatedSection, errors: string[]): void {
		if (advanced.timeoutMs !== undefined) {
			const timeout = parseInt(String(advanced.timeoutMs));
			if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
				errors.push("advanced.timeoutMs must be between 1000 and 300000 ms (5 min)");
			}
		}

		if (advanced.maxKeyLength !== undefined) {
			const length = parseInt(String(advanced.maxKeyLength));
			if (isNaN(length) || length < 100 || length > 50000) {
				errors.push("advanced.maxKeyLength must be between 100 and 50000");
			}
		}

		if (advanced.maxBatchSize !== undefined) {
			const size = parseInt(String(advanced.maxBatchSize));
			if (isNaN(size) || size < 1 || size > 100) {
				errors.push("advanced.maxBatchSize must be between 1 and 100");
			}
		}
	}

	/**
	 * Validate object depth to prevent circular references and deep nesting.
	 * @param {unknown} obj - Object to validate.
	 * @param {number} [maxDepth=10] - Maximum depth.
	 * @param {number} [currentDepth=0] - Current depth.
	 * @returns {boolean} - True if valid.
	 * @throws {Error} If depth exceeded.
	 */
	static validateObjectDepth(
		obj: unknown,
		maxDepth: number = this.MAX_CONFIG_DEPTH,
		currentDepth: number = 0
	): boolean {
		if (currentDepth > maxDepth) {
			throw new Error(`Configuration object too deeply nested (max depth: ${maxDepth})`);
		}

		if (obj && typeof obj === "object" && !Array.isArray(obj)) {
			for (const value of Object.values(obj)) {
				if (value && typeof value === "object") {
					this.validateObjectDepth(value, maxDepth, currentDepth + 1);
				}
			}
		}

		return true;
	}
}

export default InputValidator;
