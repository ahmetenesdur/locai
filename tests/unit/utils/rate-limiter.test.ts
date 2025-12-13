import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// We need to access the Class from the default export instance usually,
// but looking at source it exports "new RateLimiter(config)".
// To test thoroughly we might want to interact with that singleton.
import rateLimiter from "../../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		rateLimiter.clearAllQueues();
		// Reset config if needed, though clearAllQueues handles state
	});

	it("should enqueue and execute a task", async () => {
		const task = vi.fn().mockResolvedValue("result");
		const result = await rateLimiter.enqueue("openai", task);

		expect(result).toBe("result");
		expect(task).toHaveBeenCalled();
	});

	it("should throw for unknown provider", async () => {
		const task = vi.fn();
		await expect(rateLimiter.enqueue("unknown", task)).rejects.toThrow("Unknown provider");
	});

	it("should respect concurrency limits", async () => {
		// Mock provider limits to 1 concurrency for testing
		rateLimiter.updateConfig({
			providerLimits: {
				openai: { concurrency: 1, rpm: 100 },
			},
		});

		let resolveTask1: (val: any) => void;
		const task1 = new Promise((resolve) => {
			resolveTask1 = resolve;
		});

		const taskFn1 = vi.fn().mockReturnValue(task1);
		const taskFn2 = vi.fn().mockResolvedValue("result2");

		// Start task 1
		const p1 = rateLimiter.enqueue("openai", taskFn1);

		// Start task 2 - should be queued because concurrency is 1
		const p2 = rateLimiter.enqueue("openai", taskFn2);

		// Check queue size via internal or status (Assuming internal access for test or relying on behavior)
		expect(rateLimiter.getQueueSize("openai")).toBe(1); // Task 1 running, Task 2 queued

		// Finish task 1
		// @ts-ignore
		resolveTask1("result1");
		await p1;

		// Task 2 should now proceed
		await p2;
		expect(taskFn2).toHaveBeenCalled();
	});

	it("should handle task failures", async () => {
		const error = new Error("fail");
		const task = vi.fn().mockRejectedValue(error);

		await expect(rateLimiter.enqueue("openai", task)).rejects.toThrow("fail");
	});
});
