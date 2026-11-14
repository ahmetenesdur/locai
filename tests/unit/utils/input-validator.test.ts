import { describe, it, expect, vi, afterEach } from "vitest";
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

		describe("nested provider sections", () => {
			// apiProvider set so the only possible warning comes from the section under test
			const base = {
				source: "en",
				targets: ["tr"],
				localesDir: "./locales",
				apiProvider: "openai",
			};

			afterEach(() => {
				vi.restoreAllMocks();
			});

			it.each([null, "key", 5])(
				"should report a non-object apiConfig entry (%s)",
				(settings) => {
					expect(() =>
						InputValidator.validateConfig({ ...base, apiConfig: { openai: settings } })
					).toThrow("apiConfig.openai must be an object");
				}
			);

			it("should report a null providerLimits entry instead of crashing", () => {
				expect(() =>
					InputValidator.validateConfig({
						...base,
						rateLimiter: { providerLimits: { openai: null } },
					})
				).toThrow("rateLimiter.providerLimits.openai must be an object");
			});

			it.each([5, "fast", true, [60]])(
				"should load a non-object providerLimits entry (%s) with a warning",
				(limits) => {
					const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
					expect(() =>
						InputValidator.validateConfig({
							...base,
							verbose: true,
							rateLimiter: { providerLimits: { openai: limits } },
						})
					).not.toThrow();
					expect(warn).toHaveBeenCalledWith(
						expect.stringContaining(
							"rateLimiter.providerLimits.openai should be an object"
						)
					);
				}
			);

			it("should accept object providerLimits entries without a warning", () => {
				const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
				expect(() =>
					InputValidator.validateConfig({
						...base,
						verbose: true,
						rateLimiter: { providerLimits: { openai: { rpm: 60, concurrency: 5 } } },
					})
				).not.toThrow();
				expect(warn).not.toHaveBeenCalled();
			});
		});

		describe("retryOptions delay order", () => {
			const base = { source: "en", targets: ["tr"], localesDir: "./locales" };
			const validate = (initialDelay: unknown, maxDelay: unknown) => () =>
				InputValidator.validateConfig({
					...base,
					retryOptions: { initialDelay, maxDelay },
				});

			it("should compare string delays numerically", () => {
				expect(validate("5000", "10000")).not.toThrow();
				expect(validate("9000", "2000")).toThrow(
					"retryOptions.initialDelay cannot be greater than maxDelay"
				);
			});

			it("should reject an initialDelay greater than maxDelay", () => {
				expect(validate(5000, 2000)).toThrow(
					"retryOptions.initialDelay cannot be greater than maxDelay"
				);
				expect(validate(1000, 1000)).not.toThrow();
			});
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
