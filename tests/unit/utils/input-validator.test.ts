import { describe, it, expect } from "vitest";
import InputValidator from "../../../src/utils/input-validator.js";

describe("InputValidator", () => {
	describe("validateLanguageCode", () => {
		it.each([
			"en",
			"tr",
			"fil", // 3-letter language
			"en-US",
			"pt-BR",
			"zh-Hant", // script
			"zh-Hant-TW", // script + region
			"sr-Latn",
			"es-419", // UN M.49 numeric region
		])("should accept well-formed BCP 47 tag %s", (tag) => {
			expect(InputValidator.validateLanguageCode(tag)).toBe(tag);
		});

		it.each([
			["EN", "en"],
			["en-us", "en-US"],
			["PT-br", "pt-BR"],
			["zh-hant", "zh-Hant"],
			["ZH-HANT-tw", "zh-Hant-TW"],
			["FIL", "fil"],
			["  de-at  ", "de-AT"],
		])("should canonicalize %j to %s", (input, expected) => {
			expect(InputValidator.validateLanguageCode(input)).toBe(expected);
		});

		it("should throw error for empty language code", () => {
			expect(() => InputValidator.validateLanguageCode("")).toThrow(
				"language must be a non-empty string"
			);
			expect(() => InputValidator.validateLanguageCode("   ")).toThrow(
				"cannot be empty after trimming"
			);
		});

		it.each([
			"e", // language too short
			"engl", // language too long
			"english",
			"123",
			"en-", // empty subtag
			"en-U", // region too short
			"en-USA", // 3-letter region
			"es-41", // 2-digit region
			"zh-Han", // 3-letter script
			"zh-TW-Hant", // region before script
			"en_US", // underscore separator
			"en-US-x-private", // extensions/private use not supported
			"en US",
		])("should reject malformed tag %j", (tag) => {
			expect(() => InputValidator.validateLanguageCode(tag)).toThrow("Invalid language code");
		});

		it.each(["../en", "en/US", "en\\US"])("should reject path characters in %j", (tag) => {
			expect(() => InputValidator.validateLanguageCode(tag)).toThrow("forbidden characters");
		});
	});

	describe("validateConfig", () => {
		it("should canonicalize source and targets in place", () => {
			const config = {
				source: "EN",
				targets: ["pt-br", "zh-hant-tw", "es-419"],
				localesDir: "./locales",
				apiProvider: "openai",
			};

			InputValidator.validateConfig(config);

			expect(config.source).toBe("en");
			expect(config.targets).toEqual(["pt-BR", "zh-Hant-TW", "es-419"]);
		});

		it("should report malformed target tags", () => {
			expect(() =>
				InputValidator.validateConfig({
					source: "en",
					targets: ["tr", "pt_BR"],
					localesDir: "./locales",
				})
			).toThrow("Invalid target languages");
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
			expect(() => InputValidator.validateText(null)).toThrow("cannot be null");
		});

		it("should throw if text too long", () => {
			const longText = "a".repeat(InputValidator.MAX_TEXT_LENGTH + 1);
			expect(() => InputValidator.validateText(longText)).toThrow("too long");
		});
	});
});
