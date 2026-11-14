/**
 * Confidence scoring for translations.
 *
 * The score is computed from the translation itself: checks for problems a model commonly
 * introduces (lost placeholders or HTML tags, untranslated text, leftover commentary, unusual
 * length or ending punctuation), scaled by fixed factors for the content category, the language
 * pair and the provider. The model's own confidence (e.g. logprobs) is not used.
 */

export interface ConfidenceIssue {
	type: string;
	severity: "warning" | "error";
	message: string;
}

export interface ConfidenceOptions {
	sourceText: string;
	translation: string;
	sourceLang: string;
	targetLang: string;
	provider: string;
	category?: string;
}

export interface ConfidenceResult {
	/** 0-1: the quality score scaled by the category, language pair and provider factors. */
	score: number;
	level: "high" | "medium" | "low" | "very_low";
	/** 0-1: 1 minus the penalties of the failed checks. */
	qualityScore: number;
	details: {
		categoryAdjustment: number;
		languageFactor: number;
		providerReliability: number;
	};
	/** One entry per failed check. */
	issues: ConfidenceIssue[];
}

class ConfidenceScorer {
	/**
	 * Score a translation against its source text.
	 * @param {ConfidenceOptions} options
	 * @returns {ConfidenceResult} { score, level, qualityScore, details, issues }
	 */
	static calculateConfidence(options: ConfidenceOptions): ConfidenceResult {
		const {
			sourceText,
			translation,
			sourceLang,
			targetLang,
			provider,
			category = "general",
		} = options;

		const { qualityScore, issues } = this._checkTranslation(sourceText, translation);
		const categoryAdjustment = this._getCategoryAdjustment(category, provider);
		const languageFactor = this._getLanguagePairFactor(sourceLang, targetLang);
		const providerReliability = this._getProviderReliability(provider, category);

		// Harder categories, language pairs and providers lower the score (weighted 3:2:1)
		const contextFactor =
			(categoryAdjustment * 3 + languageFactor * 2 + providerReliability) / 6;
		const score = parseFloat((qualityScore * contextFactor).toFixed(3));

		return {
			score,
			level: this._getConfidenceLevel(score),
			qualityScore,
			details: {
				categoryAdjustment,
				languageFactor,
				providerReliability,
			},
			issues,
		};
	}

	/**
	 * Check the translation against its source. Each failed check adds an issue and lowers the
	 * quality score from 1: by 0.4 for a problem that breaks or invalidates the translation, by
	 * 0.2 for an unusual length and by 0.1 for different ending punctuation.
	 */
	private static _checkTranslation(
		sourceText: string,
		translation: string
	): { qualityScore: number; issues: ConfidenceIssue[] } {
		const issues: ConfidenceIssue[] = [];
		let penalty = 0;
		const fail = (
			type: string,
			severity: ConfidenceIssue["severity"],
			cost: number,
			message: string
		) => {
			issues.push({ type, severity, message });
			penalty += cost;
		};

		const sourcePlaceholders = (sourceText.match(/\{[^}]+\}/g) || []).length;
		const translationPlaceholders = (translation.match(/\{[^}]+\}/g) || []).length;
		if (sourcePlaceholders !== translationPlaceholders) {
			fail(
				"placeholder",
				"error",
				0.4,
				`Placeholder count mismatch: ${sourcePlaceholders} → ${translationPlaceholders}`
			);
		}

		const sourceTags = (sourceText.match(/<[^>]+>/g) || []).length;
		const translationTags = (translation.match(/<[^>]+>/g) || []).length;
		if (sourceTags !== translationTags) {
			fail(
				"html_tag",
				"error",
				0.4,
				`HTML tag count mismatch: ${sourceTags} → ${translationTags}`
			);
		}

		const lengthRatio = translation.length / sourceText.length;
		if (lengthRatio < 0.3 || lengthRatio > 3.0) {
			fail(
				"length",
				"warning",
				0.2,
				`Translation is ${Math.round(lengthRatio * 100)}% of source length`
			);
		}

		const sourceEndsWithPunctuation = /[.!?;:]$/.test(sourceText.trim());
		const translationEndsWithPunctuation = /[.!?;:]$/.test(translation.trim());
		if (sourceEndsWithPunctuation !== translationEndsWithPunctuation) {
			fail("punctuation", "warning", 0.1, "Ending punctuation differs from the source");
		}

		if (translation.trim().length < 2) {
			fail("too_short", "error", 0.4, "Translation is empty or a single character");
		}

		if (sourceText.toLowerCase().trim() === translation.toLowerCase().trim()) {
			fail("untranslated", "error", 0.4, "Translation is identical to the source");
		}

		const artifacts = [
			/^translation:/i,
			/^translated text:/i,
			/^here is/i,
			/^the translation is/i,
		];
		if (artifacts.some((pattern) => pattern.test(translation))) {
			fail("ai_artifact", "error", 0.4, "Translation starts with model commentary");
		}

		return { qualityScore: parseFloat(Math.max(0, 1 - penalty).toFixed(3)), issues };
	}

	/**
	 * Get category-specific adjustment
	 */
	private static _getCategoryAdjustment(category: string, provider: string): number {
		const categoryWeights: Record<string, number> = {
			legal: 0.7, // Legal is complex, lower confidence
			technical: 0.85, // Technical is consistent
			defi: 0.75, // DeFi has specific terminology
			marketing: 0.9, // Marketing is creative, higher tolerance
			ui: 0.95, // UI is straightforward
			general: 1.0,
		};

		// Provider-specific category expertise
		const providerExpertise: Record<string, Record<string, number>> = {
			openai: { legal: 1.0, technical: 1.0, general: 1.0 },
			gemini: { technical: 0.95, marketing: 1.0, general: 0.95 },
			deepseek: { technical: 1.0, general: 0.9 },
			dashscope: { general: 0.9 },
			xai: { technical: 0.95, general: 0.9 },
		};

		const baseWeight = categoryWeights[category] || 1.0;
		const expertise =
			providerExpertise[provider]?.[category] || providerExpertise[provider]?.general || 0.9;

		return baseWeight * expertise;
	}

	/**
	 * Get language pair complexity factor
	 */
	private static _getLanguagePairFactor(sourceTag: string, targetTag: string): number {
		// Compare on the primary language subtag so "zh-Hant" or "pt-BR" behave like "zh" / "pt"
		const sourceLang = sourceTag.split("-")[0].toLowerCase();
		const targetLang = targetTag.split("-")[0].toLowerCase();

		// Similar language pairs get higher confidence
		const similarPairs: Record<string, string[]> = {
			en: ["es", "fr", "de", "pl"],
			es: ["en", "fr", "pl"],
			fr: ["en", "es", "de"],
			de: ["en", "fr"],
			ru: ["uk", "pl"],
			zh: ["ja"],
			ja: ["zh"],
		};

		// Complex languages (different scripts/grammar)
		const complexLanguages = ["zh", "ja", "ar", "th", "hi", "yo"];

		let factor = 1.0;

		// Check if pair is similar
		if (similarPairs[sourceLang]?.includes(targetLang)) {
			factor += 0.1; // Boost for similar pairs
		}

		// Reduce confidence for complex target languages
		if (complexLanguages.includes(targetLang)) {
			factor -= 0.15;
		}

		// Reduce confidence for complex source languages
		if (complexLanguages.includes(sourceLang)) {
			factor -= 0.05;
		}

		return Math.max(0.5, Math.min(1.0, factor));
	}

	/**
	 * Get provider reliability for specific tasks
	 */
	private static _getProviderReliability(provider: string, category: string): number {
		const reliability: Record<string, Record<string, number>> = {
			openai: { default: 0.95, legal: 0.95, technical: 0.95 },
			gemini: { default: 0.9, marketing: 0.95 },
			deepseek: { default: 0.85, technical: 0.9 },
			dashscope: { default: 0.85 },
			xai: { default: 0.85, technical: 0.9 },
		};

		return reliability[provider]?.[category] || reliability[provider]?.default || 0.8;
	}

	/**
	 * Determine confidence level from score
	 */
	private static _getConfidenceLevel(score: number): "high" | "medium" | "low" | "very_low" {
		if (score >= 0.9) return "high";
		if (score >= 0.7) return "medium";
		if (score >= 0.5) return "low";
		return "very_low";
	}

	/**
	 * Get confidence color for terminal display
	 */
	static getConfidenceColor(score: number): string {
		if (score >= 0.9) return "[HIGH]"; // High
		if (score >= 0.7) return "[MED]"; // Medium
		if (score >= 0.5) return "[LOW]"; // Low
		return "[VLOW]"; // Very Low
	}

	/**
	 * Format confidence for display
	 */
	static formatConfidence(score: number): string {
		const color = this.getConfidenceColor(score);
		const percentage = (score * 100).toFixed(1);
		return `${color} ${percentage}%`;
	}
}

export default ConfidenceScorer;
