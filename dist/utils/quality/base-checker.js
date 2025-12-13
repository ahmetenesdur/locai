/**
 * Base Quality Checker.
 * Common infrastructure for all quality checkers.
 */
class BaseChecker {
    rules;
    styleGuide;
    /**
     * Create a new BaseChecker.
     * @param {CheckerOptions} [options={}] - Configuration options.
     */
    constructor(options = {}) {
        this.rules = {
            placeholderConsistency: true,
            htmlTagsConsistency: true,
            punctuationCheck: true,
            lengthValidation: true,
            sanitizeOutput: true,
            ...options,
        };
        this.styleGuide = {
            formality: options.styleGuide?.formality || "neutral",
            toneOfVoice: options.styleGuide?.toneOfVoice || "professional",
        };
    }
    /**
     * Create an issue object.
     */
    createIssue(type, message, details = {}) {
        return {
            type,
            message,
            timestamp: new Date().toISOString(),
            ...details,
        };
    }
    /**
     * Create a fix object.
     */
    createFix(type, message, details = {}) {
        return {
            type,
            message,
            timestamp: new Date().toISOString(),
            ...details,
        };
    }
    /**
     * Validate translation.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validate(_sourceText, _translatedText, _options) {
        const issues = [];
        return {
            isValid: issues.length === 0,
            issues,
        };
    }
    /**
     * Validate and fix translation.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validateAndFix(sourceText, translatedText) {
        return {
            originalText: translatedText,
            fixedText: translatedText,
            isModified: false,
            issues: [],
            fixes: [],
        };
    }
}
export default BaseChecker;
