/**
 * Base Quality Checker.
 * Common infrastructure for all quality checkers.
 */

export interface CheckerOptions {
	placeholderConsistency?: boolean;
	htmlTagsConsistency?: boolean;
	punctuationCheck?: boolean;
	lengthValidation?: boolean;
	sanitizeOutput?: boolean;
	rules?: Record<string, any>;
	styleGuide?: {
		formality?: string;
		toneOfVoice?: string;
	};
	context?: Record<string, any>;
	[key: string]: any;
}

export interface Issue {
	type: string;
	message: string;
	timestamp: string;
	[key: string]: any;
}

export interface Fix {
	type: string;
	message: string;
	timestamp: string;
	[key: string]: any;
}

export interface ValidationResult {
	isValid: boolean;
	issues: Issue[];
	source?: string;
	translated?: string;
	context?: Record<string, any>;
}

export interface FixResult {
	originalText: string;
	fixedText: string;
	isModified: boolean;
	issues: Issue[];
	fixes: Fix[];
	metadata?: {
		sourceLength: number;
		originalLength: number;
		fixedLength: number;
		timestamp: string;
	};
}

class BaseChecker {
	protected rules: Record<string, boolean | any>;
	protected styleGuide: { formality: string; toneOfVoice: string };

	/**
	 * Create a new BaseChecker.
	 * @param {CheckerOptions} [options={}] - Configuration options.
	 */
	constructor(options: CheckerOptions = {}) {
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
	createIssue(type: string, message: string, details: Record<string, any> = {}): Issue {
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
	createFix(type: string, message: string, details: Record<string, any> = {}): Fix {
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
	validate(_sourceText: string, _translatedText: string, _options?: any): ValidationResult {
		const issues: Issue[] = [];
		return {
			isValid: issues.length === 0,
			issues,
		};
	}

	/**
	 * Validate and fix translation.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	validateAndFix(sourceText: string, translatedText: string): FixResult {
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
