import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAIProvider } from "../../../src/providers/openai.js";
import axios from "axios";

vi.mock("axios");

describe("OpenAIProvider", () => {
	let provider: OpenAIProvider;
	let mockClient: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockClient = {
			post: vi.fn(),
			interceptors: {
				request: { use: vi.fn() },
				response: { use: vi.fn() },
			},
		};
		(axios.create as any).mockReturnValue(mockClient);

		process.env.OPENAI_API_KEY = "test-key";
		provider = new OpenAIProvider();
	});

	it("should initialize with correct config", () => {
		expect(axios.create).toHaveBeenCalledWith(
			expect.objectContaining({
				baseURL: "https://api.openai.com/v1",
				headers: expect.objectContaining({
					Authorization: "Bearer test-key",
				}),
			})
		);
	});

	it("should translate text successfully", async () => {
		const mockResponse = {
			data: {
				choices: [{ message: { content: "Translated Text" } }],
			},
		};
		mockClient.post.mockResolvedValue(mockResponse);

		const result = await provider.translate("Hello", "en", "es");

		expect(result).toBe("Translated Text");
		expect(mockClient.post).toHaveBeenCalledWith(
			"/chat/completions",
			expect.objectContaining({
				model: "gpt-4o",
				messages: expect.arrayContaining([
					expect.objectContaining({
						role: "user",
						content: expect.stringContaining("Hello"),
					}),
				]),
			})
		);
	});

	it("should handle API errors", async () => {
		const error = {
			response: {
				status: 500,
				data: { error: { message: "Server Error" } },
			},
		};
		mockClient.post.mockRejectedValue(error);

		await expect(provider.translate("Hello", "en", "es")).rejects.toThrow("Server Error");
	});

	it("should handle rate limiting", async () => {
		const error = {
			response: {
				status: 429,
				headers: { "retry-after": 60 },
				data: {},
			},
		};
		mockClient.post.mockRejectedValue(error);

		// RetryHelper logic wraps the call.
		// If we mock RetryHelper or check if it propagates usage.
		// But OpenAIProvider calls handleApiError which throws RateLimitError.
		// Since we are mocking failures, we expect it to eventually fail after retries (default 2)
		// or fail with specific error.

		await expect(provider.translate("Hello", "en", "es")).rejects.toThrow();
		// Ideally verify it threw a specific RateLimit error type or code if exported.
	});
});
