import BaseChecker from "./base-checker.js";
import PlaceholderChecker from "./placeholder-checker.js";
import HtmlTagChecker from "./html-tag-checker.js";
import PunctuationChecker from "./punctuation-checker.js";
import LengthChecker from "./length-checker.js";
import TextSanitizer from "./text-sanitizer.js";
import QuoteBalanceChecker from "./quote-balance-checker.js";

class QualityChecker extends BaseChecker {
	constructor(options = {}) {
		super(options);
		this.initializeCheckers();
		this.context = options.context || {};
	}

	initializeCheckers() {
		this.placeholderChecker = new PlaceholderChecker();
		this.htmlTagChecker = new HtmlTagChecker();
		this.punctuationChecker = new PunctuationChecker();
		this.lengthChecker = new LengthChecker();
		this.textSanitizer = new TextSanitizer();
		this.quoteBalanceChecker = new QuoteBalanceChecker();
	}

	validate(sourceText, translatedText, options = {}) {
		const issues = [];

		if (this.rules.placeholderConsistency) {
			issues.push(...this.placeholderChecker.checkPlaceholders(sourceText, translatedText));
		}

		if (this.rules.htmlTagsConsistency) {
			issues.push(...this.htmlTagChecker.checkHtmlTags(sourceText, translatedText));
		}

		if (this.rules.punctuationCheck) {
			issues.push(...this.punctuationChecker.checkPunctuation(sourceText, translatedText));
		}

		// Quote balance validation
		if (this.rules.quoteBalanceCheck !== false) {
			issues.push(...this.quoteBalanceChecker.checkQuoteBalance(translatedText));
			issues.push(
				...this.quoteBalanceChecker.validateQuoteConsistency(sourceText, translatedText)
			);
		}

		if (this.rules.lengthValidation) {
			issues.push(...this.lengthChecker.checkLength(sourceText, translatedText, options));
		}

		if (this.rules.sanitizeOutput) {
			translatedText = this.sanitizeTranslation(translatedText);
		}

		return {
			isValid: issues.length === 0,
			issues,
			source: sourceText,
			translated: translatedText,
			context: this.context,
		};
	}

	validateAndFix(sourceText, translatedText, options = {}) {
		let fixedText = translatedText;
		const issues = [];
		const fixes = [];

		if (this.rules.sanitizeOutput) {
			fixedText = this.sanitizeTranslation(fixedText);
		}

		if (this.rules.placeholderConsistency) {
			const result = this.placeholderChecker.fixPlaceholders(sourceText, fixedText);
			fixedText = result.text;
			issues.push(...result.foundIssues);
			fixes.push(...result.appliedFixes);
		}

		if (this.rules.htmlTagsConsistency) {
			const result = this.htmlTagChecker.fixHtmlTags(sourceText, fixedText);
			fixedText = result.text;
			issues.push(...result.foundIssues);
			fixes.push(...result.appliedFixes);
		}

		if (this.rules.punctuationCheck) {
			const result = this.punctuationChecker.fixPunctuation(sourceText, fixedText);
			fixedText = result.text;
			issues.push(...result.foundIssues);
			fixes.push(...result.appliedFixes);
		}

		// Quote balance auto-fix
		if (this.rules.quoteBalanceCheck !== false) {
			const result = this.quoteBalanceChecker.fixQuoteBalance(fixedText);
			fixedText = result.text;
			issues.push(...result.foundIssues);
			fixes.push(...result.appliedFixes);
		}

		return {
			originalText: translatedText,
			fixedText,
			isModified: translatedText !== fixedText,
			issues,
			fixes,
			metadata: {
				sourceLength: sourceText.length,
				originalLength: translatedText.length,
				fixedLength: fixedText.length,
				timestamp: new Date().toISOString(),
			},
		};
	}

	sanitizeTranslation(text) {
		if (!text) return text;

		// First pass sanitization
		let sanitized = this.textSanitizer.sanitize(text);

		// Remove any remaining think tags
		if (sanitized.includes("<think>")) {
			sanitized = this.textSanitizer.removeThinkTags(sanitized);
		}

		// Final cleanup of duplicate lines
		sanitized = sanitized
			.split("\n")
			.filter((line, index, arr) => line !== arr[index - 1])
			.join("\n");

		return sanitized;
	}
}

export default QualityChecker;
