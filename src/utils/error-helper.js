/**
 * Centralized Error Handling System
 * Provides detailed, actionable error messages with context and solutions
 */

class ErrorHelper {
	// Error categories with codes
	static ErrorCodes = {
		// API Errors (1xxx)
		API_RATE_LIMIT: "ERR_API_1001",
		API_AUTH_FAILED: "ERR_API_1002",
		API_SERVER_ERROR: "ERR_API_1003",
		API_NETWORK: "ERR_API_1004",
		API_TIMEOUT: "ERR_API_1005",
		API_INVALID_KEY: "ERR_API_1006",
		API_QUOTA_EXCEEDED: "ERR_API_1007",
		API_RESPONSE_ERROR: "ERR_API_1008",

		// Configuration Errors (2xxx)
		CONFIG_NOT_FOUND: "ERR_CFG_2001",
		CONFIG_INVALID: "ERR_CFG_2002",
		CONFIG_VALIDATION: "ERR_CFG_2003",
		CONFIG_MISSING_FIELD: "ERR_CFG_2004",

		// File Errors (3xxx)
		FILE_NOT_FOUND: "ERR_FILE_3001",
		FILE_READ_ERROR: "ERR_FILE_3002",
		FILE_WRITE_ERROR: "ERR_FILE_3003",
		FILE_PERMISSION: "ERR_FILE_3004",

		// Validation Errors (4xxx)
		VALIDATION_LANGUAGE: "ERR_VAL_4001",
		VALIDATION_TEXT: "ERR_VAL_4002",
		VALIDATION_PROVIDER: "ERR_VAL_4003",
		VALIDATION_CONCURRENCY: "ERR_VAL_4004",

		// Translation Errors (5xxx)
		TRANSLATION_FAILED: "ERR_TRN_5001",
		TRANSLATION_QUALITY: "ERR_TRN_5002",
		TRANSLATION_TIMEOUT: "ERR_TRN_5003",
	};

	/**
	 * Create a detailed error with context and solutions
	 */
	static createError(type, details = {}) {
		const errorInfo = this._getErrorInfo(type, details);
		const error = new Error(errorInfo.message);
		error.code = errorInfo.code;
		error.type = type;
		error.details = details;
		error.solutions = errorInfo.solutions;
		error.context = errorInfo.context;
		return error;
	}

	/**
	 * Format error for display
	 */
	static formatError(error, options = {}) {
		const { showDebug = false, showSolutions = true, showContext = true } = options;

		const output = [];

		// Error header
		const code = error.code || "ERR_UNKNOWN";
		const title = error.type || "Error";
		output.push(`\n${title} [${code}]`);
		output.push("");

		// Problem description
		if (error.message) {
			output.push("Problem:");
			const lines = error.message.split("\n");
			lines.forEach((line) => output.push(`   ${line}`));
			output.push("");
		}

		// Context (why it happened)
		if (showContext && error.context && error.context.length > 0) {
			output.push("Why This Happened:");
			error.context.forEach((ctx) => output.push(`   • ${ctx}`));
			output.push("");
		}

		// Solutions (how to fix)
		if (showSolutions && error.solutions && error.solutions.length > 0) {
			output.push("How to Fix:");
			error.solutions.forEach((solution, i) => output.push(`   ${i + 1}. ${solution}`));
			output.push("");
		}

		// Debug information
		if (showDebug && error.details) {
			output.push("Debug Info:");
			Object.entries(error.details).forEach(([key, value]) => {
				const displayValue =
					typeof value === "object" ? JSON.stringify(value, null, 2) : value;
				output.push(`   ${key}: ${displayValue}`);
			});
			output.push("");
		}

		// Help section
		output.push("Need Help?");
		output.push("   • Documentation: https://github.com/ahmetenesdur/ai-localization-tool");
		output.push(
			"   • Report issue: https://github.com/ahmetenesdur/ai-localization-tool/issues"
		);
		output.push("");

		return output.join("\n");
	}

	/**
	 * Get error information based on type
	 */
	static _getErrorInfo(type, details) {
		const errorMap = {
			// API Rate Limit
			API_RATE_LIMIT: {
				code: this.ErrorCodes.API_RATE_LIMIT,
				message: this._buildRateLimitMessage(details),
				context: [
					"You're sending requests too quickly for your API tier",
					"Concurrent requests exceeded the provider's rate limit",
					"Rate limiter might be disabled or misconfigured",
				],
				solutions: [
					`Wait ${details.retryAfter || "60"} seconds for rate limit to reset`,
					`Reduce concurrency: localize translate --concurrency ${Math.max(1, (details.currentConcurrency || 5) - 3)}`,
					"Enable rate limiting in localize.config.js: rateLimiter.enabled = true",
					`Check your ${details.provider || "API"} plan limits and consider upgrading`,
				],
			},

			// API Authentication
			API_AUTH_FAILED: {
				code: this.ErrorCodes.API_AUTH_FAILED,
				message: `Authentication failed for ${details.provider || "API provider"}${details.statusCode ? ` (${details.statusCode})` : ""}`,
				context: [
					"API key is missing, invalid, or expired",
					"API key might not have the required permissions",
					"Environment variable might not be set correctly",
				],
				solutions: [
					`Set your API key in .env file: ${this._getEnvKeyName(details.provider)}=your-key-here`,
					`Verify your API key at: ${this._getProviderConsoleUrl(details.provider)}`,
					"Check that .env file is in your project root directory",
					"Restart your terminal after setting environment variables",
					"Ensure .env file is not in .gitignore (for local development)",
				],
			},

			// API Server Error
			API_SERVER_ERROR: {
				code: this.ErrorCodes.API_SERVER_ERROR,
				message: `${details.provider || "API"} server error${details.statusCode ? ` (${details.statusCode})` : ""}${details.apiMessage ? `: ${details.apiMessage}` : ""}`,
				context: [
					`${details.provider || "The API provider"} is experiencing technical difficulties`,
					"This is a temporary issue on the provider's side",
					"Your configuration and code are likely correct",
				],
				solutions: [
					"Wait a few minutes and try again",
					"Check provider status page for known issues",
					`Use fallback provider: localize translate --provider ${this._suggestFallbackProvider(details.provider)}`,
					"Enable automatic fallback: Set useFallback=true in config",
				],
			},

			// Network Error
			API_NETWORK: {
				code: this.ErrorCodes.API_NETWORK,
				message: `Cannot connect to ${details.provider || "API provider"}`,
				context: [
					"No internet connection or network is blocked",
					"Firewall or proxy blocking API requests",
					"DNS resolution failure",
					"Provider's API endpoint might be down",
				],
				solutions: [
					"Check your internet connection",
					"Verify firewall/proxy settings allow HTTPS requests",
					"Try using a VPN if the provider is blocked in your region",
					"Check provider status page",
					`Use alternative provider: localize translate --provider ${this._suggestFallbackProvider(details.provider)}`,
				],
			},

			// API Timeout
			API_TIMEOUT: {
				code: this.ErrorCodes.API_TIMEOUT,
				message: `Request to ${details.provider || "API"} timed out after ${details.timeout || "30000"}ms`,
				context: [
					"API response took too long",
					"Network latency is high",
					"Request might be too complex or large",
				],
				solutions: [
					"Increase timeout in config: advanced.timeoutMs = 60000",
					"Check your internet connection speed",
					"Reduce batch size: advanced.maxBatchSize = 10",
					"Split large translations into smaller chunks",
				],
			},

			// Invalid API Key Format
			API_INVALID_KEY: {
				code: this.ErrorCodes.API_INVALID_KEY,
				message: `Invalid API key format for ${details.provider || "provider"}`,
				context: [
					"API key doesn't match the expected format",
					"Key might be corrupted or incomplete",
					"Wrong provider key used",
				],
				solutions: [
					`Get a valid API key from: ${this._getProviderConsoleUrl(details.provider)}`,
					"Ensure no extra spaces or quotes in .env file",
					"Check that you're using the correct provider's key",
					"Regenerate your API key if needed",
				],
			},

			// Configuration Not Found
			CONFIG_NOT_FOUND: {
				code: this.ErrorCodes.CONFIG_NOT_FOUND,
				message: "Configuration file not found",
				context: [
					"localize.config.js or localize.config.cjs doesn't exist",
					"You're running the command from wrong directory",
					"Config file might have wrong extension",
				],
				solutions: [
					"Create localize.config.js in your project root",
					"Run the command from your project root directory",
					"Copy example config: npx ai-localization-tool init (if available)",
					"Check the README for configuration examples",
				],
			},

			// Configuration Validation
			CONFIG_VALIDATION: {
				code: this.ErrorCodes.CONFIG_VALIDATION,
				message: details.validationErrors
					? `Configuration has ${details.validationErrors.length} error(s):\n${details.validationErrors.map((e, i) => `   ${i + 1}. ${e}`).join("\n")}`
					: "Configuration validation failed",
				context: [
					"One or more configuration values are invalid",
					"Required fields might be missing",
					"Values might be out of valid range",
				],
				solutions: [
					"Run: localize validate-config --show-warnings",
					"Check localize.config.js against the documentation",
					"Fix the errors listed above",
					"Use --debug flag to see full configuration details",
				],
			},

			// File Not Found
			FILE_NOT_FOUND: {
				code: this.ErrorCodes.FILE_NOT_FOUND,
				message: `File not found: ${details.filePath || "unknown"}`,
				context: [
					"The specified file doesn't exist",
					"File path might be incorrect",
					"File might have been moved or deleted",
				],
				solutions: [
					`Create the file: ${details.filePath}`,
					"Check the file path in your configuration",
					"Verify localesDir points to the correct directory",
					`Ensure source file exists: ${details.expectedSource || "locales/en.json"}`,
				],
			},

			// Translation Failed
			TRANSLATION_FAILED: {
				code: this.ErrorCodes.TRANSLATION_FAILED,
				message: `Translation failed for key "${details.key || "unknown"}"${details.language ? ` (${details.language})` : ""}`,
				context: [
					details.reason || "Unknown translation error",
					"AI provider returned an error or invalid response",
					"Text might contain unsupported characters or format",
				],
				solutions: [
					"Check if the text contains special characters that need escaping",
					"Try with a different provider using --provider flag",
					"Enable debug mode to see full error details: --debug",
					"Skip this key and continue: Use --force to retry",
				],
			},

			// Validation Language
			VALIDATION_LANGUAGE: {
				code: this.ErrorCodes.VALIDATION_LANGUAGE,
				message: `Invalid language code: ${details.langCode || "unknown"}`,
				context: [
					"Language code must be ISO 639-1 format (e.g., 'en', 'tr', 'de')",
					"Only lowercase 2-letter codes are supported",
					"Regional codes like 'en-US' are not yet supported",
				],
				solutions: [
					"Use ISO 639-1 two-letter codes (e.g., 'en' instead of 'english')",
					"Check supported languages: https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes",
					`Update your config: ${details.field || "targets"} = ["en", "tr", "de"]`,
				],
			},
		};

		return (
			errorMap[type] || {
				code: "ERR_UNKNOWN",
				message: details.message || "An unknown error occurred",
				context: ["No additional context available"],
				solutions: [
					"Run with --debug flag for more information",
					"Check the documentation",
					"Report this issue if it persists",
				],
			}
		);
	}

	/**
	 * Build rate limit message with details
	 */
	static _buildRateLimitMessage(details) {
		const provider = details.provider || "API provider";
		const limit = details.limit || "60";
		const current = details.current || "unknown";

		let msg = `${provider} rate limit exceeded`;

		if (details.limit) {
			msg += ` (${limit} requests/minute)`;
		}

		if (details.current) {
			msg += `\n   Current: ${current} requests in last minute`;
		}

		if (details.retryAfter) {
			msg += `\n   Retry after: ${details.retryAfter} seconds`;
		}

		return msg;
	}

	/**
	 * Get environment variable name for provider
	 */
	static _getEnvKeyName(provider) {
		const envMap = {
			openai: "OPENAI_API_KEY",
			gemini: "GEMINI_API_KEY",
			deepseek: "DEEPSEEK_API_KEY",
			dashscope: "DASHSCOPE_API_KEY",
			xai: "XAI_API_KEY",
		};
		return envMap[provider?.toLowerCase()] || `${provider?.toUpperCase()}_API_KEY`;
	}

	/**
	 * Get provider console URL
	 */
	static _getProviderConsoleUrl(provider) {
		const urlMap = {
			openai: "https://platform.openai.com/api-keys",
			gemini: "https://makersuite.google.com/app/apikey",
			deepseek: "https://platform.deepseek.com/api-keys",
			dashscope: "https://dashscope.console.aliyun.com/",
			xai: "https://console.x.ai/",
		};
		return urlMap[provider?.toLowerCase()] || "provider console";
	}

	/**
	 * Suggest fallback provider
	 */
	static _suggestFallbackProvider(currentProvider) {
		const fallbackOrder = ["openai", "gemini", "deepseek", "dashscope", "xai"];
		const current = currentProvider?.toLowerCase();
		const index = fallbackOrder.indexOf(current);

		if (index === -1 || index === fallbackOrder.length - 1) {
			return fallbackOrder[0];
		}

		return fallbackOrder[index + 1];
	}

	/**
	 * Quick error creators for common cases
	 */
	static rateLimitError(provider, details = {}) {
		return this.createError("API_RATE_LIMIT", { provider, ...details });
	}

	static authError(provider, statusCode, apiMessage) {
		return this.createError("API_AUTH_FAILED", { provider, statusCode, apiMessage });
	}

	static serverError(provider, statusCode, apiMessage) {
		return this.createError("API_SERVER_ERROR", { provider, statusCode, apiMessage });
	}

	static networkError(provider) {
		return this.createError("API_NETWORK", { provider });
	}

	static timeoutError(provider, timeout) {
		return this.createError("API_TIMEOUT", { provider, timeout });
	}

	static configNotFoundError() {
		return this.createError("CONFIG_NOT_FOUND");
	}

	static configValidationError(validationErrors) {
		return this.createError("CONFIG_VALIDATION", { validationErrors });
	}

	static fileNotFoundError(filePath, expectedSource) {
		return this.createError("FILE_NOT_FOUND", { filePath, expectedSource });
	}

	static translationError(key, language, reason) {
		return this.createError("TRANSLATION_FAILED", { key, language, reason });
	}

	static languageValidationError(langCode, field) {
		return this.createError("VALIDATION_LANGUAGE", { langCode, field });
	}
}

export default ErrorHelper;
