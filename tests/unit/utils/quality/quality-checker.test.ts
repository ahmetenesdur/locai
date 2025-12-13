import { describe, it, expect, beforeEach } from "vitest";
import QualityChecker from "../../../../src/utils/quality/index.js";

describe("QualityChecker", () => {
	let qualityChecker: QualityChecker;
	const defaultOptions = {
		rules: {
			placeholderConsistency: true,
			htmlTagsConsistency: true,
			punctuationCheck: true,
			lengthValidation: true,
			quoteBalanceCheck: true,
			sanitizeOutput: true,
		},
	};

	beforeEach(() => {
		qualityChecker = new QualityChecker(defaultOptions);
	});

	describe("validate", () => {
		it("should return valid result for perfect translation", () => {
			const result = qualityChecker.validate("Hello", "Selam");
			expect(result.isValid, JSON.stringify(result.issues)).toBe(true);
			expect(result.issues).toHaveLength(0);
		});

		it("should detect placeholder issues", () => {
			const result = qualityChecker.validate("Hello {name}", "Merhaba");
			expect(result.isValid).toBe(false);
			expect(result.issues.some((i) => i.type === "placeholder")).toBe(true);
		});

		it("should detect punctuation issues", () => {
			// Assuming PunctuationChecker checks strictly
			const result = qualityChecker.validate("Hello.", "Merhaba");
			expect(result.isValid).toBe(false);
			expect(result.issues.some((i) => i.type === "punctuation")).toBe(true);
		});
	});

	describe("validateAndFix", () => {
		it("should fix simple issues", () => {
			// Test sanitation or simple fixes
			// For example, <think> removal if sanitizeOutput is on
			const dirty = "Translation <think>thought process</think>";
			const result = qualityChecker.validateAndFix("Source", dirty);

			expect(result.fixedText).toBe("Translation");
			expect(result.isModified).toBe(true);
		});

		it("should return original text if no issues", () => {
			const clean = "Clean translation";
			const result = qualityChecker.validateAndFix("Source", clean);
			expect(result.fixedText).toBe(clean);
			expect(result.isModified).toBe(false);
		});
	});

	describe("sanitizeTranslation", () => {
		it("should remove think tags", () => {
			const text = "Answer <think>thinking...</think>";
			expect(qualityChecker.sanitizeTranslation(text)).toBe("Answer");
		});

		it("should deduplicate lines", () => {
			const text = "Line 1\nLine 1\nLine 2";
			expect(qualityChecker.sanitizeTranslation(text)).toBe("Line 1\nLine 2");
		});
	});
});
