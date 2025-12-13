import { describe, it, expect } from "vitest";
import ErrorHelper from "../../../src/utils/error-helper.js";

describe("ErrorHelper", () => {
	describe("createError", () => {
		it("should create a basic error", () => {
			const error = ErrorHelper.createError("API_TIMEOUT", {
				provider: "openai",
				timeout: 5000,
			});
			expect(error).toBeInstanceOf(Error);
			expect(error.code).toBe(ErrorHelper.ErrorCodes.API_TIMEOUT);
			expect(error.message).toContain("timed out");
			expect(error.details).toEqual({ provider: "openai", timeout: 5000 });
		});

		it("should fallback for unknown error type", () => {
			const error = ErrorHelper.createError("UNKNOWN_TYPE", {
				message: "Something happened",
			});
			expect(error.code).toBe("ERR_UNKNOWN");
			expect(error.message).toBe("Something happened");
		});
	});

	describe("formatError", () => {
		it("should format error with context and solutions", () => {
			const error = ErrorHelper.createError("API_RATE_LIMIT", {
				provider: "openai",
				retryAfter: 60,
			});
			const formatted = ErrorHelper.formatError(error);

			expect(formatted).toContain("API_RATE_LIMIT");
			expect(formatted).toContain("Problem:");
			expect(formatted).toContain("Why This Happened:");
			expect(formatted).toContain("How to Fix:");
			expect(formatted).toContain("openai rate limit exceeded");
		});

		it("should include debug info when requested", () => {
			const error = ErrorHelper.createError("API_RATE_LIMIT", { provider: "openai" });
			const formatted = ErrorHelper.formatError(error, { showDebug: true });

			expect(formatted).toContain("Debug Info:");
			expect(formatted).toContain("provider: openai");
		});
	});

	describe("Specialized creators", () => {
		it("should create rateLimitError", () => {
			const error = ErrorHelper.rateLimitError("openai", { retryAfter: 10 });
			expect(error.code).toBe(ErrorHelper.ErrorCodes.API_RATE_LIMIT);
		});

		it("should create translationError", () => {
			const error = ErrorHelper.translationError("key1", "en", "failed");
			expect(error.code).toBe(ErrorHelper.ErrorCodes.TRANSLATION_FAILED);
		});
	});
});
