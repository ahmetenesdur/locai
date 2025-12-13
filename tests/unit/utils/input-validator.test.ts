import { describe, it, expect } from "vitest";
import InputValidator from "../../../src/utils/input-validator.js";

describe("InputValidator", () => {
	describe("validateLanguageCode", () => {
		it("should validate correct language codes", () => {
			expect(InputValidator.validateLanguageCode("en")).toBe("en");
			expect(InputValidator.validateLanguageCode("tr")).toBe("tr");
			expect(InputValidator.validateLanguageCode("en-US")).toBe("en-us");
		});

		it("should throw error for empty language code", () => {
			expect(() => InputValidator.validateLanguageCode("")).toThrow(
				"language must be a non-empty string"
			);
		});

		it("should throw error for invalid format", () => {
			expect(() => InputValidator.validateLanguageCode("eng")).toThrow(
				"Invalid language code"
			);
			expect(() => InputValidator.validateLanguageCode("123")).toThrow(
				"Invalid language code"
			);
		});
	});

	describe("validateProvider", () => {
		it("should validate supported providers", () => {
			expect(InputValidator.validateProvider("openai")).toBe("openai");
			expect(InputValidator.validateProvider("Gemini")).toBe("gemini");
		});

		it("should throw error for unsupported provider", () => {
			expect(() => InputValidator.validateProvider("unsupported")).toThrow(
				"Invalid API provider"
			);
		});
	});

	describe("validateText", () => {
		it("should validate valid text", () => {
			const text = "Hello world";
			expect(InputValidator.validateText(text)).toBe(text);
		});

		it("should throw for null/undefined", () => {
			// @ts-expect-error Testing runtime check
			expect(() => InputValidator.validateText(null)).toThrow("cannot be null");
		});

		it("should throw if text too long", () => {
			const longText = "a".repeat(InputValidator.MAX_TEXT_LENGTH + 1);
			expect(() => InputValidator.validateText(longText)).toThrow("too long");
		});
	});
});
