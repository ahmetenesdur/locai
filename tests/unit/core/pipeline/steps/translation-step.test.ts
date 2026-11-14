import { describe, it, expect, vi, beforeEach } from "vitest";
import TranslationStep from "../../../../../src/core/pipeline/steps/TranslationStep.js";
import ProviderFactory from "../../../../../src/core/provider-factory.js";
import FallbackProvider from "../../../../../src/core/fallback-provider.js";
import {
	createTranslationContext,
	PipelineOptions,
	TranslationContext,
} from "../../../../../src/core/pipeline/context.js";

// Mock ProviderFactory
vi.mock("../../../../../src/core/provider-factory.js", () => ({
	default: {
		getProvider: vi.fn(),
	},
}));

const pipelineOptions: PipelineOptions = {
	source: "en",
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
};

describe("TranslationStep", () => {
	let context: TranslationContext;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		context = createTranslationContext("testKey", "Hello", "en", "es", pipelineOptions);
		vi.clearAllMocks();
	});

	it("should translate successfully", async () => {
		const mockProvider = {
			translate: vi.fn().mockResolvedValue("Hola"),
		};
		vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider);

		const step = new TranslationStep({ apiProvider: "mock" });
		await step.execute(context, async () => {});

		expect(mockProvider.translate).toHaveBeenCalledWith("Hello", "en", "es", expect.anything());
		expect(context.translatedText).toBe("Hola");
	});

	it("should use protectedText if available", async () => {
		context.protectedText = "Protected Hello";
		const mockProvider = {
			translate: vi.fn().mockResolvedValue("Hola Protected"),
		};
		vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider);

		const step = new TranslationStep({ apiProvider: "mock" });
		await step.execute(context, async () => {});

		expect(mockProvider.translate).toHaveBeenCalledWith(
			"Protected Hello",
			"en",
			"es",
			expect.anything()
		);
	});

	it("should handle errors", async () => {
		const mockProvider = {
			translate: vi.fn().mockRejectedValue(new Error("API Error")),
		};
		vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider);

		const step = new TranslationStep({ apiProvider: "mock" });
		await step.execute(context, async () => {});

		expect(context.result.success).toBe(false);
		expect(context.result.error).toBe("API Error");
		expect(context.result.translated).toBe("Hello"); // Fallback to source
	});

	it("should score what a fallback-chain provider returns when confidence scoring is enabled", async () => {
		// ProviderFactory hands out a FallbackProvider by default: a plain translate() that
		// returns the translation text, nothing more
		const provider = new FallbackProvider([
			{ name: "openai", implementation: { translate: vi.fn().mockResolvedValue("Hola") } },
		]);
		vi.mocked(ProviderFactory.getProvider).mockReturnValue(provider);
		context = createTranslationContext("greeting", "Hello {name}", "en", "es", pipelineOptions);

		const step = new TranslationStep({ apiProvider: "OpenAI" }, { enabled: true });
		await step.execute(context, async () => {});

		expect(context.translatedText).toBe("Hola");
		expect(context.confidence).toMatchObject({
			details: { providerReliability: 0.95 },
			issues: [expect.objectContaining({ type: "placeholder" })],
		});
		expect(context.confidence?.score).toBeLessThan(0.7);
	});

	it("should not score when confidence scoring is disabled", async () => {
		vi.mocked(ProviderFactory.getProvider).mockReturnValue({
			translate: vi.fn().mockResolvedValue("Hola"),
		});

		const step = new TranslationStep({ apiProvider: "mock" });
		await step.execute(context, async () => {});

		expect(context.translatedText).toBe("Hola");
		expect(context.confidence).toBeUndefined();
	});
});
