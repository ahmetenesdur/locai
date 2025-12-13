import { describe, it, expect, vi, beforeEach } from "vitest";
import RetryHelper, { RetryOptions } from "../../../src/utils/retry-helper.js";

describe("RetryHelper", () => {
	// Mock RetryHelper.delay to speed up tests (so we don't actually wait seconds)
	beforeEach(() => {
		vi.spyOn(RetryHelper, "delay").mockResolvedValue();
	});

	describe("withRetry", () => {
		it("should execute operation successfully without retries", async () => {
			const operation = vi.fn().mockResolvedValue("success");
			const result = await RetryHelper.withRetry(operation);

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it("should retry on failure and eventually succeed", async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockResolvedValue("success");

			const result = await RetryHelper.withRetry(operation, {
				maxRetries: 3,
				initialDelay: 10,
			});

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it("should throw after max retries exceeded", async () => {
			const operation = vi.fn().mockRejectedValue(new Error("always fail"));

			await expect(
				RetryHelper.withRetry(operation, { maxRetries: 2, initialDelay: 1 })
			).rejects.toThrow("always fail");

			expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});

		it("should respect custom retry condition", async () => {
			const operation = vi.fn().mockRejectedValue(new Error("fail"));
			const retryCondition = vi.fn().mockReturnValue(false); // Never retry

			await expect(
				RetryHelper.withRetry(operation, { retryCondition, maxRetries: 3 })
			).rejects.toThrow("fail");

			expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt
		});
	});

	describe("defaultRetryCondition", () => {
		it("should return true for rate limits", () => {
			const error = { status: 429 };
			expect(RetryHelper.defaultRetryCondition(error, ["rate_limit"])).toBe(true);
		});

		it("should return true for timeouts", () => {
			const error = { code: "ETIMEDOUT" };
			expect(RetryHelper.defaultRetryCondition(error, ["timeout"])).toBe(true);
		});

		it("should return false for non-retryable errors", () => {
			const error = { status: 400 }; // Bad request
			expect(RetryHelper.defaultRetryCondition(error, ["rate_limit"])).toBe(false);
		});
	});
});
