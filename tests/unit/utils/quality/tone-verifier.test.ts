import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToneVerifier } from "../../../../src/utils/quality/tone-verifier.js";
import ProviderFactory from "../../../../src/core/provider-factory.js";

// Mock ProviderFactory
vi.mock("../../../../src/core/provider-factory.js", () => {
	const mockProvider = {
		chat: vi.fn(),
		analyze: vi.fn(),
		translate: vi.fn(),
	};
	return {
		default: {
			getProvider: vi.fn(() => mockProvider),
			getAvailableProviders: vi.fn(() => ["openai"]),
		},
	};
});

describe("ToneVerifier", () => {
	let verifier: ToneVerifier;
	let mockProvider: any;

	beforeEach(() => {
		verifier = new ToneVerifier();
		mockProvider = ProviderFactory.getProvider("openai");
		vi.clearAllMocks();
	});

	it("should use requested provider", async () => {
		mockProvider.chat.mockResolvedValue(JSON.stringify({ passed: true, score: 10 }));
		const result = await verifier.verify("src", "trgt", "en", "es", "formal", "gemini");
		expect(ProviderFactory.getProvider).toHaveBeenCalledWith("gemini", true);
	});

	it("should use openai as default provider", async () => {
		mockProvider.chat.mockResolvedValue(JSON.stringify({ passed: true, score: 10 }));
		await verifier.verify("src", "trgt", "en", "es", "formal");
		expect(ProviderFactory.getProvider).toHaveBeenCalledWith("openai", true);
	});

	it("should pass options to provider", async () => {
		mockProvider.chat.mockResolvedValue(JSON.stringify({ passed: true, score: 10 }));
		const options = { temperature: 0.1 };
		await verifier.verify("src", "trgt", "en", "es", "formal", "openai", options);
		expect(mockProvider.chat).toHaveBeenCalledWith(expect.any(Array), options);
	});

	it("should initialize provider lazily", async () => {
		// Mock a valid response to avoid internal error
		mockProvider.chat.mockResolvedValue(JSON.stringify({ passed: true, score: 10 }));

		// Create a new instance effectively
		const newVerifier = new ToneVerifier();
		// initialize is private but called by verify
		await newVerifier.verify("src", "trgt", "en", "es", "formal");
		expect(ProviderFactory.getProvider).toHaveBeenCalled();
	});

	it("should return perfect score when no target tone is provided", async () => {
		const result = await verifier.verify("src", "trgt", "en", "es", "");
		expect(result.passed).toBe(true);
		expect(result.score).toBe(10);
	});

	it("should parse valid JSON response from chat", async () => {
		const mockResponse = JSON.stringify({
			passed: true,
			score: 9,
			reasoning: "Good tone",
			suggestions: "None",
		});
		mockProvider.chat.mockResolvedValue(mockResponse);

		const result = await verifier.verify("Hello", "Hola", "en", "es", "formal");

		expect(result.passed).toBe(true);
		expect(result.score).toBe(9);
		expect(result.reasoning).toBe("Good tone");
	});

	it("should clean markdown and parse JSON response", async () => {
		const mockResponse =
			"```json\n" +
			JSON.stringify({
				passed: false,
				score: 4,
				reasoning: "Too casual",
			}) +
			"\n```";
		mockProvider.chat.mockResolvedValue(mockResponse);

		const result = await verifier.verify("Hello", "Hola", "en", "es", "formal");

		expect(result.passed).toBe(false);
		expect(result.score).toBe(4);
	});

	it("should fail open (return passed) when provider throws", async () => {
		mockProvider.chat.mockRejectedValue(new Error("API Error"));

		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await verifier.verify("Hello", "Hola", "en", "es", "formal");

		expect(result.passed).toBe(true);
		expect(result.score).toBe(0);
		expect(result.reasoning).toContain("Verification failed");

		consoleSpy.mockRestore();
	});
});
