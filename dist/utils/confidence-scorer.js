/**
 * Quality Confidence Scoring System
 * Calculates confidence scores for translations based on AI response and quality checks
 */
class ConfidenceScorer {
    /**
     * Calculate final confidence score
     * @param {ConfidenceOptions} options
     * @returns {ConfidenceResult} { score, details, issues }
     */
    static calculateConfidence(options) {
        const { aiConfidence = 0.8, sourceText, translation, sourceLang, targetLang, provider, category = "general", } = options;
        // Quality checks
        const qualityScore = this._calculateQualityScore(sourceText, translation);
        // Category-specific adjustments
        const categoryAdjustment = this._getCategoryAdjustment(category, provider);
        // Language pair complexity
        const languageFactor = this._getLanguagePairFactor(sourceLang, targetLang);
        // Provider-specific reliability
        const providerReliability = this._getProviderReliability(provider, category);
        // Calculate weighted final score
        const finalScore = aiConfidence * 0.4 + // AI's own confidence
            qualityScore * 0.3 + // Our quality checks
            categoryAdjustment * 0.15 + // Category-specific adjustment
            languageFactor * 0.1 + // Language pair complexity
            providerReliability * 0.05; // Provider reliability
        // Clamp to 0-1 range
        const score = Math.max(0, Math.min(1, finalScore));
        // Determine confidence level
        const level = this._getConfidenceLevel(score);
        // Collect issues
        const issues = this._detectIssues(sourceText, translation, score);
        return {
            score: parseFloat(score.toFixed(3)),
            level,
            aiConfidence,
            qualityScore,
            details: {
                categoryAdjustment,
                languageFactor,
                providerReliability,
            },
            issues,
            needsReview: score < 0.7,
            autoApprove: score >= 0.9,
        };
    }
    /**
     * Calculate quality score based on internal checks
     */
    static _calculateQualityScore(sourceText, translation) {
        let score = 1.0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const issues = [];
        // Check 1: Placeholder preservation
        const sourcePlaceholders = (sourceText.match(/\{[^}]+\}/g) || []).length;
        const translationPlaceholders = (translation.match(/\{[^}]+\}/g) || []).length;
        if (sourcePlaceholders !== translationPlaceholders) {
            score -= 0.3;
            issues.push("placeholder_mismatch");
        }
        // Check 2: HTML tag preservation
        const sourceTags = (sourceText.match(/<[^>]+>/g) || []).length;
        const translationTags = (translation.match(/<[^>]+>/g) || []).length;
        if (sourceTags !== translationTags) {
            score -= 0.2;
            issues.push("html_tag_mismatch");
        }
        // Check 3: Length appropriateness
        const lengthRatio = translation.length / sourceText.length;
        if (lengthRatio < 0.3 || lengthRatio > 3.0) {
            score -= 0.2;
            issues.push("extreme_length_difference");
        }
        // Check 4: Punctuation consistency
        const sourceEndsWithPunctuation = /[.!?;:]$/.test(sourceText.trim());
        const translationEndsWithPunctuation = /[.!?;:]$/.test(translation.trim());
        if (sourceEndsWithPunctuation !== translationEndsWithPunctuation) {
            score -= 0.1;
            issues.push("punctuation_inconsistency");
        }
        // Check 5: Empty or too short translation
        if (translation.trim().length < 2) {
            score -= 0.4;
            issues.push("translation_too_short");
        }
        // Check 6: Same as source (no translation occurred)
        if (sourceText.toLowerCase().trim() === translation.toLowerCase().trim()) {
            score -= 0.3;
            issues.push("identical_to_source");
        }
        // Check 7: Contains AI artifacts
        const artifacts = [
            /^translation:/i,
            /^translated text:/i,
            /^here is/i,
            /^the translation is/i,
        ];
        if (artifacts.some((pattern) => pattern.test(translation))) {
            score -= 0.2;
            issues.push("contains_ai_artifacts");
        }
        return Math.max(0, score);
    }
    /**
     * Get category-specific adjustment
     */
    static _getCategoryAdjustment(category, provider) {
        const categoryWeights = {
            legal: 0.7, // Legal is complex, lower confidence
            technical: 0.85, // Technical is consistent
            defi: 0.75, // DeFi has specific terminology
            marketing: 0.9, // Marketing is creative, higher tolerance
            ui: 0.95, // UI is straightforward
            general: 1.0,
        };
        // Provider-specific category expertise
        const providerExpertise = {
            openai: { legal: 1.0, technical: 1.0, general: 1.0 },
            gemini: { technical: 0.95, marketing: 1.0, general: 0.95 },
            deepseek: { technical: 1.0, general: 0.9 },
            dashscope: { general: 0.9 },
            xai: { technical: 0.95, general: 0.9 },
        };
        const baseWeight = categoryWeights[category] || 1.0;
        const expertise = providerExpertise[provider]?.[category] || providerExpertise[provider]?.general || 0.9;
        return baseWeight * expertise;
    }
    /**
     * Get language pair complexity factor
     */
    static _getLanguagePairFactor(sourceLang, targetLang) {
        // Similar language pairs get higher confidence
        const similarPairs = {
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
    static _getProviderReliability(provider, category) {
        const reliability = {
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
    static _getConfidenceLevel(score) {
        if (score >= 0.9)
            return "high";
        if (score >= 0.7)
            return "medium";
        if (score >= 0.5)
            return "low";
        return "very_low";
    }
    /**
     * Detect specific issues with translation
     */
    static _detectIssues(sourceText, translation, score) {
        const issues = [];
        if (score < 0.5) {
            issues.push({
                type: "quality",
                severity: "critical",
                message: "Translation quality is very low, manual review required",
            });
        }
        else if (score < 0.7) {
            issues.push({
                type: "quality",
                severity: "warning",
                message: "Translation quality is below threshold, review recommended",
            });
        }
        // Check for specific patterns
        const sourcePlaceholders = (sourceText.match(/\{[^}]+\}/g) || []).length;
        const translationPlaceholders = (translation.match(/\{[^}]+\}/g) || []).length;
        if (sourcePlaceholders !== translationPlaceholders) {
            issues.push({
                type: "placeholder",
                severity: "error",
                message: `Placeholder count mismatch: ${sourcePlaceholders} → ${translationPlaceholders}`,
            });
        }
        const lengthRatio = translation.length / sourceText.length;
        if (lengthRatio > 2.5) {
            issues.push({
                type: "length",
                severity: "warning",
                message: `Translation is ${Math.round(lengthRatio * 100)}% of source length`,
            });
        }
        return issues;
    }
    /**
     * Get confidence color for terminal display
     */
    static getConfidenceColor(score) {
        if (score >= 0.9)
            return "[HIGH]"; // High
        if (score >= 0.7)
            return "[MED]"; // Medium
        if (score >= 0.5)
            return "[LOW]"; // Low
        return "[VLOW]"; // Very Low
    }
    /**
     * Format confidence for display
     */
    static formatConfidence(score) {
        const color = this.getConfidenceColor(score);
        const percentage = (score * 100).toFixed(1);
        return `${color} ${percentage}%`;
    }
    /**
     * Extract AI confidence from provider response
     */
    static extractAIConfidence(response, provider) {
        // OpenAI logprobs-based confidence
        if (provider === "openai" && response.choices?.[0]?.logprobs) {
            const logprobs = response.choices[0].logprobs.token_logprobs || [];
            if (logprobs.length > 0) {
                // Convert log probabilities to confidence
                const avgLogProb = logprobs.reduce((sum, lp) => sum + (lp || -1), 0) /
                    logprobs.length;
                return Math.exp(avgLogProb); // Convert back to probability
            }
        }
        // Gemini confidence scores
        if (provider === "gemini" && response.candidates?.[0]) {
            const finishReason = response.candidates[0].finishReason;
            if (finishReason === "STOP")
                return 0.9; // Normal completion
            if (finishReason === "MAX_TOKENS")
                return 0.75; // Incomplete
            return 0.8; // Default
        }
        // Default confidence based on finish reason
        const finishReason = response.choices?.[0]?.finish_reason || response.finishReason;
        if (finishReason === "stop" || finishReason === "STOP")
            return 0.85;
        if (finishReason === "length")
            return 0.7;
        // Fallback
        return 0.8;
    }
}
export default ConfidenceScorer;
