/**
 * Input validation utility for security and data integrity.
 * Defines regex patterns, limits, and validation methods.
 */

import path from "path";

class InputValidator {
	static LANGUAGE_CODE_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/;
	static VALID_PROVIDERS = ["dashscope", "xai", "openai", "deepseek", "gemini"];
	static MAX_TEXT_LENGTH = 10000;
	static MAX_KEY_LENGTH = 500;
	static MAX_PATH_LENGTH = 1000;
	static MAX_CONFIG_DEPTH = 10;

	static DANGEROUS_PATTERNS = [
		/\.\.\//g,
		/\0/g,
		/[\x00-\x08\x0b\x0c\x0e-\x1f\x7F]/g, // eslint-disable-line no-control-regex
		/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
		/javascript:/gi,
		/data:.*base64/gi,
	];

	/**
	 * Validate and sanitize language code.
	 * @param {string} langCode - Language code to validate.
	 * @param {string} [paramName="language"] - Parameter name for error messages.
	 * @returns {string} - Sanitized language code.
	 * @throws {Error} If validation fails.
	 */
	static validateLanguageCode(langCode, paramName = "language") {
		if (!langCode || typeof langCode !== "string") {
			throw new Error(`${paramName} must be a non-empty string`);
		}

		const sanitized = langCode.trim().toLowerCase();

		if (sanitized.length === 0) {
			throw new Error(`${paramName} cannot be empty after trimming`);
		}

		if (sanitized.length > 10) {
			throw new Error(`${paramName} code too long: '${langCode}' (max 10 characters)`);
		}

		if (sanitized.includes("..") || sanitized.includes("/") || sanitized.includes("\\")) {
			throw new Error(`${paramName} code contains forbidden characters: '${langCode}'`);
		}

		if (!this.LANGUAGE_CODE_PATTERN.test(sanitized)) {
			throw new Error(
				`Invalid ${paramName} code: '${langCode}'. Must match pattern: ${this.LANGUAGE_CODE_PATTERN}`
			);
		}

		return sanitized;
	}

	/**
	 * Validate array of language codes.
	 * @param {string[]} langCodes - Array of language codes.
	 * @param {string} [paramName="languages"] - Parameter name for errors.
	 * @returns {string[]} - Sanitized array of language codes.
	 * @throws {Error} If array is empty or contains invalid codes.
	 */
	static validateLanguageCodes(langCodes, paramName = "languages") {
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
	 * @param {string} dirPath - Directory path.
	 * @param {string} [paramName="directory"] - Parameter name for errors.
	 * @returns {string} - Resolved and validated absolute path.
	 * @throws {Error} If path is invalid or outside working directory.
	 */
	static validateDirectoryPath(dirPath, paramName = "directory") {
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
	 * @param {string} text - Text to validate.
	 * @param {string} [paramName="text"] - Parameter name for errors.
	 * @returns {string} - Validated text.
	 * @throws {Error} If text is invalid or too long.
	 */
	static validateText(text, paramName = "text") {
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
	 * @param {string} key - Key to validate.
	 * @param {string} [paramName="key"] - Parameter name.
	 * @returns {string} - Validated key.
	 * @throws {Error} If key is invalid, too long, or contains traversal.
	 */
	static validateKey(key, paramName = "key") {
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
	 * @param {string} provider - Provider name.
	 * @param {string} [paramName="provider"] - Parameter name.
	 * @returns {string} - Normalized provider name.
	 * @throws {Error} If provider is unknown.
	 */
	static validateProvider(provider, paramName = "provider") {
		if (!provider || typeof provider !== "string") {
			throw new Error(`${paramName} must be a non-empty string`);
		}

		const normalized = provider.toLowerCase().trim();

		if (!this.VALID_PROVIDERS.includes(normalized)) {
			throw new Error(
				`Invalid ${paramName}: '${provider}'. Valid providers: ${this.VALID_PROVIDERS.join(", ")}`
			);
		}

		return normalized;
	}

	/**
	 * Sanitize filename to prevent path traversal.
	 * @param {string} filename - Filename to sanitize.
	 * @param {string} [extension=null] - Optional extension to enforce.
	 * @returns {string} - Sanitized filename.
	 * @throws {Error} If filename is invalid.
	 */
	static sanitizeFilename(filename, extension = null) {
		if (!filename || typeof filename !== "string") {
			throw new Error("Filename must be a non-empty string");
		}

		let sanitized = path
			.basename(filename)
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // eslint-disable-line no-control-regex
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
	static createSafeFilePath(baseDir, filename) {
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
	 * @param {Object} config - Configuration object to validate.
	 * @returns {Object} - Validated configuration.
	 * @throws {Error} If configuration is invalid.
	 */
	static validateConfig(config) {
		if (!config || typeof config !== "object") {
			throw new Error("Configuration must be an object");
		}

		// Check config depth to prevent circular references
		this.validateObjectDepth(config);

		const errors = [];
		const warnings = [];

		// Required fields validation
		if (!config.source) {
			errors.push("Missing required field 'source' (source language)");
		} else {
			try {
				this.validateLanguageCode(config.source, "source language");
			} catch (error) {
				errors.push(`Invalid source language: ${error.message}`);
			}
		}

		if (!config.targets || !Array.isArray(config.targets) || config.targets.length === 0) {
			errors.push("Missing or empty 'targets' array (target languages)");
		} else {
			try {
				this.validateLanguageCodes(config.targets, "target languages");
			} catch (error) {
				errors.push(`Invalid target languages: ${error.message}`);
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
				errors.push(`Invalid API provider: ${error.message}`);
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
						errors.push(`Invalid provider in fallbackOrder: ${error.message}`);
					}
				}
			}
		}

		// Concurrency validation
		if (config.concurrencyLimit !== undefined) {
			const limit = parseInt(config.concurrencyLimit);
			if (isNaN(limit) || limit < 1 || limit > 50) {
				errors.push("'concurrencyLimit' must be a number between 1 and 50");
			}
		}

		// Cache configuration validation
		if (config.cacheSize !== undefined) {
			const size = parseInt(config.cacheSize);
			if (isNaN(size) || size < 100 || size > 10000) {
				errors.push("'cacheSize' must be a number between 100 and 10000");
			}
		}

		if (config.cacheTTL !== undefined) {
			const ttl = parseInt(config.cacheTTL);
			if (isNaN(ttl) || ttl < 0) {
				errors.push("'cacheTTL' must be a non-negative number (milliseconds)");
			}
			if (ttl > 7 * 24 * 60 * 60 * 1000) {
				warnings.push("'cacheTTL' is very large (>7 days), consider reducing it");
			}
		}

		// API Config validation
		if (config.apiConfig) {
			if (typeof config.apiConfig !== "object") {
				errors.push("'apiConfig' must be an object");
			} else {
				this.validateApiConfig(config.apiConfig, errors, warnings);
			}
		}

		// Rate Limiter validation
		if (config.rateLimiter) {
			if (typeof config.rateLimiter !== "object") {
				errors.push("'rateLimiter' must be an object");
			} else {
				this.validateRateLimiterConfig(config.rateLimiter, errors, warnings);
			}
		}

		// Retry options validation
		if (config.retryOptions) {
			if (typeof config.retryOptions !== "object") {
				errors.push("'retryOptions' must be an object");
			} else {
				this.validateRetryOptions(config.retryOptions, errors, warnings);
			}
		}

		// Context configuration validation
		if (config.context) {
			if (typeof config.context !== "object") {
				errors.push("'context' must be an object");
			} else {
				this.validateContextConfig(config.context, errors, warnings);
			}
		}

		// Quality checks validation
		if (config.qualityChecks) {
			if (typeof config.qualityChecks !== "object") {
				errors.push("'qualityChecks' must be an object");
			} else {
				this.validateQualityChecks(config.qualityChecks, errors, warnings);
			}
		}

		// Length control validation
		if (config.lengthControl) {
			if (typeof config.lengthControl !== "object") {
				errors.push("'lengthControl' must be an object");
			} else {
				this.validateLengthControl(config.lengthControl, errors, warnings);
			}
		}

		// Advanced settings validation
		if (config.advanced) {
			if (typeof config.advanced !== "object") {
				errors.push("'advanced' must be an object");
			} else {
				this.validateAdvancedConfig(config.advanced, errors, warnings);
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

		return config;
	}

	/**
	 * Validate API config for each provider.
	 * @param {Object} apiConfig - API configuration object.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateApiConfig(apiConfig, errors, warnings) {
		for (const [provider, settings] of Object.entries(apiConfig)) {
			if (!this.VALID_PROVIDERS.includes(provider)) {
				warnings.push(`Unknown provider in apiConfig: '${provider}'`);
				continue;
			}

			if (typeof settings !== "object") {
				errors.push(`apiConfig.${provider} must be an object`);
				continue;
			}

			// Validate temperature
			if (settings.temperature !== undefined) {
				const temp = parseFloat(settings.temperature);
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
				const tokens = parseInt(settings.maxTokens);
				if (isNaN(tokens) || tokens < 100 || tokens > 8000) {
					errors.push(`apiConfig.${provider}.maxTokens must be between 100 and 8000`);
				}
			}
		}
	}

	/**
	 * Validate rate limiter configuration.
	 * @param {Object} rateLimiter - Rate limiter configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateRateLimiterConfig(rateLimiter, errors, warnings) {
		if (rateLimiter.queueStrategy) {
			const validStrategies = ["fifo", "priority"];
			if (!validStrategies.includes(rateLimiter.queueStrategy)) {
				errors.push(
					`rateLimiter.queueStrategy must be one of: ${validStrategies.join(", ")}`
				);
			}
		}

		if (rateLimiter.queueTimeout !== undefined) {
			const timeout = parseInt(rateLimiter.queueTimeout);
			if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
				errors.push("rateLimiter.queueTimeout must be between 1000 and 120000 ms");
			}
		}

		if (rateLimiter.providerLimits) {
			if (typeof rateLimiter.providerLimits !== "object") {
				errors.push("rateLimiter.providerLimits must be an object");
			} else {
				for (const [provider, limits] of Object.entries(rateLimiter.providerLimits)) {
					if (!this.VALID_PROVIDERS.includes(provider)) {
						warnings.push(`Unknown provider in providerLimits: '${provider}'`);
						continue;
					}

					if (limits.rpm !== undefined) {
						const rpm = parseInt(limits.rpm);
						if (isNaN(rpm) || rpm < 1 || rpm > 10000) {
							errors.push(
								`rateLimiter.providerLimits.${provider}.rpm must be between 1 and 10000`
							);
						}
					}

					if (limits.concurrency !== undefined) {
						const conc = parseInt(limits.concurrency);
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
	 * @param {Object} retryOptions - Retry options.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateRetryOptions(retryOptions, errors, _warnings) {
		if (retryOptions.maxRetries !== undefined) {
			const retries = parseInt(retryOptions.maxRetries);
			if (isNaN(retries) || retries < 0 || retries > 10) {
				errors.push("retryOptions.maxRetries must be between 0 and 10");
			}
		}

		if (retryOptions.initialDelay !== undefined) {
			const delay = parseInt(retryOptions.initialDelay);
			if (isNaN(delay) || delay < 100 || delay > 10000) {
				errors.push("retryOptions.initialDelay must be between 100 and 10000 ms");
			}
		}

		if (retryOptions.maxDelay !== undefined) {
			const delay = parseInt(retryOptions.maxDelay);
			if (isNaN(delay) || delay < 1000 || delay > 60000) {
				errors.push("retryOptions.maxDelay must be between 1000 and 60000 ms");
			}
		}

		if (
			retryOptions.initialDelay &&
			retryOptions.maxDelay &&
			retryOptions.initialDelay > retryOptions.maxDelay
		) {
			errors.push("retryOptions.initialDelay cannot be greater than maxDelay");
		}
	}

	/**
	 * Validate context configuration.
	 * @param {Object} context - Context configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateContextConfig(context, errors, warnings) {
		if (context.aiProvider) {
			try {
				this.validateProvider(context.aiProvider, "context.aiProvider");
			} catch (error) {
				errors.push(`Invalid context.aiProvider: ${error.message}`);
			}
		}

		if (context.minTextLength !== undefined) {
			const length = parseInt(context.minTextLength);
			if (isNaN(length) || length < 0 || length > 1000) {
				errors.push("context.minTextLength must be between 0 and 1000");
			}
		}

		if (context.detection) {
			if (context.detection.threshold !== undefined) {
				const threshold = parseInt(context.detection.threshold);
				if (isNaN(threshold) || threshold < 1 || threshold > 20) {
					errors.push("context.detection.threshold must be between 1 and 20");
				}
			}

			if (context.detection.minConfidence !== undefined) {
				const confidence = parseFloat(context.detection.minConfidence);
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
	 * @param {Object} qualityChecks - Quality checks configuration.
	 * @param {string[]} errors - Array to push errors to.
	 * @param {string[]} warnings - Array to push warnings to.
	 */
	static validateQualityChecks(qualityChecks, errors, warnings) {
		if (qualityChecks.rules && typeof qualityChecks.rules !== "object") {
			errors.push("qualityChecks.rules must be an object");
		}

		if (qualityChecks.enabled === false && qualityChecks.autoFix === true) {
			warnings.push("qualityChecks.autoFix is enabled but qualityChecks.enabled is false");
		}
	}

	/**
	 * Validate length control configuration.
	 * @param {Object} lengthControl - Length control configuration.
	 * @param {string[]} errors - Array to push errors to.
	 */
	static validateLengthControl(lengthControl, errors) {
		if (lengthControl.mode) {
			const validModes = ["strict", "flexible", "exact", "relaxed", "smart"];
			if (!validModes.includes(lengthControl.mode)) {
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
	 * @param {Object} advanced - Advanced configuration.
	 * @param {string[]} errors - Array to push errors to.
	 */
	static validateAdvancedConfig(advanced, errors) {
		if (advanced.timeoutMs !== undefined) {
			const timeout = parseInt(advanced.timeoutMs);
			if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
				errors.push("advanced.timeoutMs must be between 1000 and 300000 ms (5 min)");
			}
		}

		if (advanced.maxKeyLength !== undefined) {
			const length = parseInt(advanced.maxKeyLength);
			if (isNaN(length) || length < 100 || length > 50000) {
				errors.push("advanced.maxKeyLength must be between 100 and 50000");
			}
		}

		if (advanced.maxBatchSize !== undefined) {
			const size = parseInt(advanced.maxBatchSize);
			if (isNaN(size) || size < 1 || size > 100) {
				errors.push("advanced.maxBatchSize must be between 1 and 100");
			}
		}
	}

	/**
	 * Sanitize translation text for security.
	 * @param {string} text - Text to sanitize.
	 * @returns {string} - Sanitized text.
	 */
	static sanitizeTranslationText(text) {
		if (!text || typeof text !== "string") {
			return text;
		}

		let sanitized = text;

		for (const pattern of this.DANGEROUS_PATTERNS) {
			sanitized = sanitized.replace(pattern, "");
		}

		sanitized = sanitized
			.replace(/\r\n/g, "\n")
			.replace(/\r/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();

		return sanitized;
	}

	/**
	 * Validate API key format.
	 * @param {string} apiKey - API key to validate.
	 * @param {string} providerName - Provider name.
	 * @returns {boolean} - True if valid.
	 * @throws {Error} If key is invalid.
	 */
	static validateApiKeyFormat(apiKey, providerName) {
		if (!apiKey || typeof apiKey !== "string") {
			throw new Error(`${providerName} API key must be a non-empty string`);
		}

		if (apiKey.length < 10) {
			throw new Error(`${providerName} API key appears too short`);
		}

		if (apiKey.length > 200) {
			throw new Error(`${providerName} API key appears too long`);
		}

		const lowercaseKey = apiKey.toLowerCase();
		const invalidPatterns = ["test", "placeholder", "example", "your-api-key", "sk-test"];

		for (const pattern of invalidPatterns) {
			if (lowercaseKey.includes(pattern)) {
				throw new Error(`${providerName} API key appears to be a placeholder`);
			}
		}

		return true;
	}

	/**
	 * Validate object depth to prevent circular references and deep nesting.
	 * @param {Object} obj - Object to validate.
	 * @param {number} [maxDepth=10] - Maximum depth.
	 * @param {number} [currentDepth=0] - Current depth.
	 * @returns {boolean} - True if valid.
	 * @throws {Error} If depth exceeded.
	 */
	static validateObjectDepth(obj, maxDepth = this.MAX_CONFIG_DEPTH, currentDepth = 0) {
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

	/**
	 * Validate request rate for an identifier.
	 * @param {string} identifier - Identifier (e.g., user ID or IP).
	 * @param {number} [maxRequestsPerMinute=60] - Max requests per minute.
	 * @returns {boolean} - True if allowed.
	 * @throws {Error} If rate limit exceeded.
	 */
	static validateRequestRate(identifier, maxRequestsPerMinute = 60) {
		const now = Date.now();
		const minute = Math.floor(now / 60000);

		if (!this._requestCounts) {
			this._requestCounts = new Map();
		}

		const key = `${identifier}-${minute}`;
		const currentCount = this._requestCounts.get(key) || 0;

		if (currentCount >= maxRequestsPerMinute) {
			throw new Error(`Too many requests from ${identifier}. Please try again later.`);
		}

		this._requestCounts.set(key, currentCount + 1);

		for (const [k] of this._requestCounts) {
			const [, keyMinute] = k.split("-");
			if (parseInt(keyMinute) < minute - 5) {
				this._requestCounts.delete(k);
			}
		}

		return true;
	}
}

export default InputValidator;
