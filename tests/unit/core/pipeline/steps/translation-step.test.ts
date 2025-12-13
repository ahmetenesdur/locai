import { describe, it, expect, vi, beforeEach } from "vitest";
import TranslationStep from "../../../../../src/core/pipeline/steps/TranslationStep.js";
import ProviderFactory from "../../../../../src/core/provider-factory.js";
import { TranslationContext } from "../../../../../src/core/pipeline/context.js";

// Mock ProviderFactory
vi.mock("../../../../../src/core/provider-factory.js", () => ({
	default: {
		getProvider: vi.fn(),
	},
}));

describe("TranslationStep", () => {
	let context: TranslationContext;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		context = {
			key: "testKey",
			sourceText: "Hello",
			sourceLang: "en",
			targetLang: "es",
			meta: {},
			result: { success: false, translated: "", error: undefined },
		} as unknown as TranslationContext;
		vi.clearAllMocks();
	});

	it("should translate successfully", async () => {
		const mockProvider = {
			translate: vi.fn().mockResolvedValue("Hola"),
		};
		(ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

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
		(ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

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
		(ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

		const step = new TranslationStep({ apiProvider: "mock" });
		await step.execute(context, async () => {});

		expect(context.result.success).toBe(false);
		expect(context.result.error).toBe("API Error");
		expect(context.result.translated).toBe("Hello"); // Fallback to source
	});

	it("should handle confidence scoring if enabled", async () => {
		const mockProvider = {
			translate: vi.fn().mockResolvedValue('{"translation":"Hola","confidence":0.9}'),
			extractTranslationWithConfidence: vi
				.fn()
				.mockReturnValue({ translation: "Hola", confidence: 0.9 }),
		};
		(ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

		const step = new TranslationStep(
			{ apiProvider: "mock" },
			{ enabled: true, autoApproveThreshold: 0.8 }
		);

		await step.execute(context, async () => {});

		expect(mockProvider.translate).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ returnRawResponse: true })
		);
		expect(context.confidence).toBe(0.9);
		expect(context.translatedText).toBe("Hola");
	});
});
