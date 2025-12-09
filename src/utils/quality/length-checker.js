/**
 * Length Validation Checker.
 * Checks if translated text length is within acceptable bounds relative to source text.
 */
class LengthChecker {
	constructor() {
		this.defaultConfig = {
			mode: "strict",
			maxDeviation: 0.1,
			minDeviation: -0.1,
		};
	}

	/**
	 * Check if translated text length is acceptable.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @param {Object} [options={}] - Validation options.
	 * @returns {Array<Object>} - Array of length issues.
	 */
	checkLength(source, translated, options = {}) {
		try {
			const sourceLength = this.calculateLength(source);
			const translatedLength = this.calculateLength(translated);
			const ratio = translatedLength / sourceLength;

			const config = this.getConfig(options);
			const { minRatio, maxRatio } = this.calculateAllowedRange(config);

			if (ratio < minRatio || ratio > maxRatio) {
				return [
					{
						type: "length",
						severity: this.determineSeverity(ratio, minRatio, maxRatio),
						message: this.generateErrorMessage(ratio, config),
						details: {
							mode: config.mode,
							context: config.context,
							targetLang: config.targetLang,
							sourceLength,
							translatedLength,
							ratio: parseFloat(ratio.toFixed(3)),
							allowedRange: {
								min: parseFloat(minRatio.toFixed(2)),
								max: parseFloat(maxRatio.toFixed(2)),
							},
							deviation: parseFloat((ratio - 1).toFixed(3)),
						},
					},
				];
			}

			return [];
		} catch (error) {
			console.error("Length check failed:", error);
			return [
				{
					type: "length",
					severity: "error",
					message: "Length validation failed due to technical error",
					details: { error: error.message },
				},
			];
		}
	}

	/**
	 * Calculate length of text ignoring whitespace.
	 * @param {string} text - Input text.
	 * @returns {number} - Length of text.
	 */
	calculateLength(text) {
		if (!text) return 0;
		return text.replace(/\s+/g, "").length;
	}

	/**
	 * Get configuration for length check.
	 * @param {Object} options - Options object.
	 * @returns {Object} - Configuration object.
	 */
	getConfig(options) {
		const lengthControl = options.lengthControl || {};
		const mode = lengthControl.mode || this.defaultConfig.mode;
		const targetLang = options.targetLang || "en";
		const context = options.detectedContext?.category || "general";

		if (mode === "smart") {
			return this.getSmartModeConfig(lengthControl, targetLang, context);
		}

		return this.getStandardModeConfig(lengthControl, mode, targetLang, context);
	}

	/**
	 * Get configuration for smart mode.
	 * @param {Object} lengthControl - Length control settings.
	 * @param {string} targetLang - Target language.
	 * @param {string} context - Content context.
	 * @returns {Object} - Smart mode configuration.
	 */
	getSmartModeConfig(lengthControl, targetLang, context) {
		const smartRules = lengthControl.rules?.smart || {};
		const langRules = smartRules.byLanguage?.[targetLang] || {};
		const contextRules = smartRules.byContext?.[context] || {};
		const defaultValue = smartRules.default || 0.15;

		return {
			mode: "smart",
			targetLang,
			context,
			maxDeviation: Math.min(langRules.max ?? defaultValue, contextRules.max ?? defaultValue),
			minDeviation: Math.max(
				langRules.min ?? -defaultValue,
				contextRules.min ?? -defaultValue
			),
		};
	}

	/**
	 * Get configuration for standard mode.
	 * @param {Object} lengthControl - Length control settings.
	 * @param {string} mode - checking mode.
	 * @param {string} targetLang - Target language.
	 * @param {string} context - Content context.
	 * @returns {Object} - Standard mode configuration.
	 */
	getStandardModeConfig(lengthControl, mode, targetLang, context) {
		const deviation = lengthControl.rules?.[mode] || this.defaultConfig.maxDeviation;
		return {
			mode,
			targetLang,
			context,
			maxDeviation: deviation,
			minDeviation: -deviation,
		};
	}

	/**
	 * Calculate allowed length ratio range.
	 * @param {Object} config - Configuration object.
	 * @returns {Object} - Allowed range (minRatio, maxRatio).
	 */
	calculateAllowedRange(config) {
		return {
			minRatio: 1 + config.minDeviation,
			maxRatio: 1 + config.maxDeviation,
		};
	}

	/**
	 * Determine severity of length mismatch.
	 * @param {number} ratio - Actual length ratio.
	 * @param {number} minRatio - Minimum allowed ratio.
	 * @param {number} maxRatio - Maximum allowed ratio.
	 * @returns {string} - Severity level ("critical" or "warning").
	 */
	determineSeverity(ratio, minRatio, maxRatio) {
		const deviation = Math.abs(ratio - 1);
		if (deviation > Math.max(Math.abs(minRatio - 1), Math.abs(maxRatio - 1)) * 1.5) {
			return "critical";
		}
		return "warning";
	}

	/**
	 * Generate error message for length mismatch.
	 * @param {number} ratio - Actual length ratio.
	 * @param {Object} config - Configuration object.
	 * @returns {string} - Error message.
	 */
	generateErrorMessage(ratio, config) {
		const percentage = Math.abs((ratio - 1) * 100).toFixed(1);
		const direction = ratio > 1 ? "longer" : "shorter";

		return (
			`Translation is ${percentage}% ${direction} than source text ` +
			`[${config.targetLang.toUpperCase()}, ${config.context}]`
		);
	}
}

export default LengthChecker;
