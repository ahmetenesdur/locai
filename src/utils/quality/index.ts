import BaseChecker, { CheckerOptions, Issue, FixResult, ValidationResult } from "./base-checker.js";
import PlaceholderChecker from "./placeholder-checker.js";
import HtmlTagChecker from "./html-tag-checker.js";
import PunctuationChecker from "./punctuation-checker.js";
import LengthChecker from "./length-checker.js";
import TextSanitizer from "./text-sanitizer.js";
import QuoteBalanceChecker from "./quote-balance-checker.js";
import StyleGuideChecker from "./style-guide-checker.js";
import MarkdownChecker from "./markdown-checker.js";
import CodeBlockChecker from "./code-block-checker.js";
import SpecialCharactersChecker from "./special-characters-checker.js";

/**
 * Main Quality Checker Class.
 * Orchestrates various quality checks and fixes for translated text.
 */
class QualityChecker extends BaseChecker {
	private placeholderChecker!: PlaceholderChecker;
	private htmlTagChecker!: HtmlTagChecker;
	private punctuationChecker!: PunctuationChecker;
	private lengthChecker!: LengthChecker;
	private textSanitizer!: TextSanitizer;
	private quoteBalanceChecker!: QuoteBalanceChecker;
	private styleGuideChecker!: StyleGuideChecker;
	private markdownChecker!: MarkdownChecker;
	private codeBlockChecker!: CodeBlockChecker;
	private specialCharactersChecker!: SpecialCharactersChecker;
	private context: Record<string, any>;

	/**
	 * Initialize QualityChecker with options.
	 */
	constructor(options: CheckerOptions = {}) {
		super(options);
		this.initializeCheckers();
		this.context = options.context || {};
	}

	/**
	 * Initialize all individual checkers.
	 */
	initializeCheckers(): void {
		this.placeholderChecker = new PlaceholderChecker();
		this.htmlTagChecker = new HtmlTagChecker();
		this.punctuationChecker = new PunctuationChecker();
		this.lengthChecker = new LengthChecker();
		this.textSanitizer = new TextSanitizer();
		this.quoteBalanceChecker = new QuoteBalanceChecker();
		this.styleGuideChecker = new StyleGuideChecker(this.styleGuide);
		this.markdownChecker = new MarkdownChecker();
		this.codeBlockChecker = new CodeBlockChecker();
		this.specialCharactersChecker = new SpecialCharactersChecker();
	}

	/**
	 * Validate translated text against source text.
	 */
	validate(
		sourceText: string,
		translatedText: string,
		options: Record<string, any> = {}
	): ValidationResult {
		const issues: Issue[] = [];

		if (this.rules.placeholderConsistency) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(
				...(this.placeholderChecker.checkPlaceholders(sourceText, translatedText) as any)
			);
		}

		if (this.rules.htmlTagsConsistency) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(this.htmlTagChecker.checkHtmlTags(sourceText, translatedText) as any));
		}

		if (this.rules.punctuationCheck) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(
				...(this.punctuationChecker.checkPunctuation(sourceText, translatedText) as any)
			);
		}

		// Quote balance validation
		if (this.rules.quoteBalanceCheck !== false) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(this.quoteBalanceChecker.checkQuoteBalance(translatedText) as any));
			issues.push(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...(this.quoteBalanceChecker.validateQuoteConsistency(
					sourceText,
					translatedText
				) as any)
			);
		}

		if (this.rules.lengthValidation) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(
				...(this.lengthChecker.checkLength(sourceText, translatedText, options) as any)
			);
		}

		// Style guide validation
		if (this.styleGuide && this.styleGuideChecker) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(
				...(this.styleGuideChecker.checkStyleGuide(sourceText, translatedText) as any)
			);
		}

		// Markdown preservation
		if (this.rules.markdownPreservation) {
			issues.push(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...(this.markdownChecker.checkMarkdownPreservation(
					sourceText,
					translatedText
				) as any)
			);
		}

		// Code block preservation
		if (this.rules.codeBlockPreservation) {
			issues.push(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...(this.codeBlockChecker.checkCodeBlockPreservation(
					sourceText,
					translatedText
				) as any)
			);
		}

		// Special characters preservation
		if (this.rules.specialCharacters) {
			issues.push(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...(this.specialCharactersChecker.checkSpecialCharacters(
					sourceText,
					translatedText
				) as any)
			);
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

	/**
	 * Validate and attempt to fix translated text.
	 */
	validateAndFix(sourceText: string, translatedText: string): FixResult {
		let fixedText = translatedText;
		const issues: Issue[] = [];
		const fixes: any[] = [];

		if (this.rules.sanitizeOutput) {
			fixedText = this.sanitizeTranslation(fixedText);
		}

		if (this.rules.placeholderConsistency) {
			const result = this.placeholderChecker.fixPlaceholders(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		if (this.rules.htmlTagsConsistency) {
			const result = this.htmlTagChecker.fixHtmlTags(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		if (this.rules.punctuationCheck) {
			const result = this.punctuationChecker.fixPunctuation(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		// Quote balance auto-fix
		if (this.rules.quoteBalanceCheck !== false) {
			const result = this.quoteBalanceChecker.fixQuoteBalance(fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		// Style guide fixes
		if (this.styleGuide && this.styleGuideChecker) {
			const result = this.styleGuideChecker.fixStyleGuide(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		// Markdown preservation fixes
		if (this.rules.markdownPreservation) {
			const result = this.markdownChecker.fixMarkdownPreservation(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		// Code block preservation fixes
		if (this.rules.codeBlockPreservation) {
			const result = this.codeBlockChecker.fixCodeBlockPreservation(sourceText, fixedText);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
			fixes.push(...result.appliedFixes);
		}

		// Special characters fixes
		if (this.rules.specialCharacters) {
			const result = this.specialCharactersChecker.fixSpecialCharacters(
				sourceText,
				fixedText
			);
			fixedText = result.text;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			issues.push(...(result.foundIssues as any));
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

	/**
	 * Sanitize translated text using multiple passes.
	 */
	sanitizeTranslation(text: string): string {
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
			.map((line) => line.trim())
			.filter((line, index, arr) => line !== arr[index - 1])
			.join("\n");

		return sanitized;
	}
}

export default QualityChecker;
