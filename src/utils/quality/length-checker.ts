export interface LengthConfig {
	mode: "strict" | "flexible" | "exact" | "relaxed" | "smart";
	maxDeviation: number;
	minDeviation: number;
	targetLang?: string;
	context?: string;
}

export interface LengthIssue {
	type: "length";
	severity: "critical" | "warning" | "error";
	message: string;
	details: {
		mode?: string;
		context?: string;
		targetLang?: string;
		sourceLength?: number;
		translatedLength?: number;
		ratio?: number;
		allowedRange?: {
			min: number;
			max: number;
		};
		deviation?: number;
		error?: string;
	};
}

/**
 * Length Validation Checker.
 * Checks if translated text length is within acceptable bounds relative to source text.
 */
class LengthChecker {
	private defaultConfig: {
		mode: string;
		maxDeviation: number;
		minDeviation: number;
	};

	constructor() {
		this.defaultConfig = {
			mode: "strict",
			maxDeviation: 0.1,
			minDeviation: -0.1,
		};
	}

	/**
	 * Check if translated text length is acceptable.
	 */
	checkLength(source: string, translated: string, options: any = {}): LengthIssue[] {
		try {
			const sourceLength = this.calculateLength(source);
			const translatedLength = this.calculateLength(translated);
			const ratio = sourceLength > 0 ? translatedLength / sourceLength : 1;

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
		} catch (error: any) {
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
	 */
	calculateLength(text: string): number {
		if (!text) return 0;
		return text.replace(/\s+/g, "").length;
	}

	/**
	 * Get configuration for length check.
	 */
	getConfig(options: any): LengthConfig {
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
	 */
	getSmartModeConfig(lengthControl: any, targetLang: string, context: string): LengthConfig {
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
	 */
	getStandardModeConfig(
		lengthControl: any,
		mode: any,
		targetLang: string,
		context: string
	): LengthConfig {
		const deviation = lengthControl.rules?.[mode] || this.defaultConfig.maxDeviation;
		return {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mode: mode as any,
			targetLang,
			context,
			maxDeviation: deviation,
			minDeviation: -deviation,
		};
	}

	/**
	 * Calculate allowed length ratio range.
	 */
	calculateAllowedRange(config: LengthConfig): { minRatio: number; maxRatio: number } {
		return {
			minRatio: 1 + config.minDeviation,
			maxRatio: 1 + config.maxDeviation,
		};
	}

	/**
	 * Determine severity of length mismatch.
	 */
	determineSeverity(ratio: number, minRatio: number, maxRatio: number): "critical" | "warning" {
		const deviation = Math.abs(ratio - 1);
		if (deviation > Math.max(Math.abs(minRatio - 1), Math.abs(maxRatio - 1)) * 1.5) {
			return "critical";
		}
		return "warning";
	}

	/**
	 * Generate error message for length mismatch.
	 */
	generateErrorMessage(ratio: number, config: LengthConfig): string {
		const percentage = Math.abs((ratio - 1) * 100).toFixed(1);
		const direction = ratio > 1 ? "longer" : "shorter";

		return (
			`Translation is ${percentage}% ${direction} than source text ` +
			`[${(config.targetLang || "").toUpperCase()}, ${config.context}]`
		);
	}
}

export default LengthChecker;
