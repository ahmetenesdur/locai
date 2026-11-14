/**
 * Base Quality Checker.
 * Common infrastructure for all quality checkers.
 */

import type { ContextConfig } from "../../core/context-processor.js";
import type { CodeBlockFixResult, CodeBlockIssue } from "./code-block-checker.js";
import type { HtmlTagFixResult, HtmlTagIssue } from "./html-tag-checker.js";
import type { LengthCheckOptions, LengthControlOptions, LengthIssue } from "./length-checker.js";
import type { MarkdownFixResult, MarkdownIssue } from "./markdown-checker.js";
import type { PlaceholderFixResult, PlaceholderIssue } from "./placeholder-checker.js";
import type { PunctuationFixResult, PunctuationIssue } from "./punctuation-checker.js";
import type { QuoteFixResult, QuoteIssue } from "./quote-balance-checker.js";
import type { SpecialCharFixResult, SpecialCharIssue } from "./special-characters-checker.js";
import type { StyleFixResult, StyleGuideConfig, StyleIssue } from "./style-guide-checker.js";

/** Toggles for the individual quality checks (the `qualityChecks.rules` config section) */
export interface QualityRules {
	placeholderConsistency?: boolean;
	htmlTagsConsistency?: boolean;
	punctuationCheck?: boolean;
	quoteBalanceCheck?: boolean;
	lengthValidation?: boolean;
	sanitizeOutput?: boolean;
	markdownPreservation?: boolean;
	codeBlockPreservation?: boolean;
	specialCharacters?: boolean;
}

export interface CheckerOptions extends QualityRules {
	/** Master switch for quality checks (the `qualityChecks.enabled` config value) */
	enabled?: boolean;
	styleGuide?: StyleGuideConfig;
	context?: Partial<ContextConfig>;
	lengthControl?: LengthControlOptions;
}

/** Generic issue record built by {@link BaseChecker.createIssue} */
export interface Issue {
	type: string;
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

/** Generic fix record built by {@link BaseChecker.createFix} */
export interface Fix {
	type: string;
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

/** Any issue reported by one of the quality checkers */
export type QualityIssue =
	| PlaceholderIssue
	| HtmlTagIssue
	| PunctuationIssue
	| QuoteIssue
	| LengthIssue
	| StyleIssue
	| MarkdownIssue
	| CodeBlockIssue
	| SpecialCharIssue;

/** Any fix applied by one of the quality checkers */
export type QualityFix =
	| PlaceholderFixResult["appliedFixes"][number]
	| HtmlTagFixResult["appliedFixes"][number]
	| PunctuationFixResult["appliedFixes"][number]
	| QuoteFixResult["appliedFixes"][number]
	| StyleFixResult["appliedFixes"][number]
	| MarkdownFixResult["appliedFixes"][number]
	| CodeBlockFixResult["appliedFixes"][number]
	| SpecialCharFixResult["appliedFixes"][number];

export interface ValidationResult {
	isValid: boolean;
	issues: QualityIssue[];
	source?: string;
	translated?: string;
	context?: Partial<ContextConfig>;
}

export interface FixResult {
	originalText: string;
	fixedText: string;
	isModified: boolean;
	issues: QualityIssue[];
	fixes: QualityFix[];
	metadata?: {
		sourceLength: number;
		originalLength: number;
		fixedLength: number;
		timestamp: string;
	};
}

class BaseChecker {
	/** Effective options: rule defaults overridden by the constructor options */
	readonly rules: CheckerOptions;
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
	createIssue(type: string, message: string, details: Record<string, unknown> = {}): Issue {
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
	createFix(type: string, message: string, details: Record<string, unknown> = {}): Fix {
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
	validate(
		_sourceText: string,
		_translatedText: string,
		_options?: LengthCheckOptions
	): ValidationResult {
		const issues: QualityIssue[] = [];
		return {
			isValid: issues.length === 0,
			issues,
		};
	}

	/**
	 * Validate and fix translation.
	 */
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
