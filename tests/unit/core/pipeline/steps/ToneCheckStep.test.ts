import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToneCheckStep } from "../../../../../src/core/pipeline/steps/ToneCheckStep.js";
import { ToneVerifier } from "../../../../../src/utils/quality/tone-verifier.js";

// Mock ToneVerifier
vi.mock("../../../../../src/utils/quality/tone-verifier.js", () => {
	return {
		ToneVerifier: class {
			verify = vi.fn();
		},
	};
});

describe("ToneCheckStep", () => {
	let step: ToneCheckStep;
	let mockContext: any;
	let mockNext: any;
	let mockVerifier: any;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		step = new ToneCheckStep({ enabled: true });
		mockContext = {
			translatedText: "Sanal Makine",
			sourceText: "Virtual Machine",
			sourceLang: "en",
			targetLang: "tr",
			options: {
				styleGuide: {
					toneOfVoice: "tech",
				},
			},
			qualityResult: {
				issues: [],
			},
		};
		mockNext = vi.fn().mockResolvedValue(undefined);

		// Get the mock instance
		// @ts-ignore
		mockVerifier = (step as any).verifier;
	});

	it("should skip verification if disabled", async () => {
		const disabledStep = new ToneCheckStep({ enabled: false });
		await disabledStep.execute(mockContext, mockNext);
		expect(mockVerifier.verify).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should skip verification if no translated text", async () => {
		mockContext.translatedText = "";
		await step.execute(mockContext, mockNext);
		expect(mockVerifier.verify).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should skip verification if no tone defined", async () => {
		mockContext.options.styleGuide.toneOfVoice = undefined;
		await step.execute(mockContext, mockNext);
		expect(mockVerifier.verify).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should pass configured provider to verifier", async () => {
		mockContext.options.styleGuide.toneProvider = "gemini";
		mockVerifier.verify.mockResolvedValue({ passed: true, score: 10 });

		await step.execute(mockContext, mockNext);

		expect(mockVerifier.verify).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.any(String),
			expect.any(String),
			expect.any(String),
			"gemini",
			undefined
		);
	});

	it("should pass configured toneProvider and analysis options to verifier", async () => {
		mockContext.options.styleGuide.toneProvider = "deepseek";
		mockContext.options.styleGuide.analysisOptions = { temperature: 0.7 };
		mockVerifier.verify.mockResolvedValue({ passed: true, score: 10 });

		await step.execute(mockContext, mockNext);

		expect(mockVerifier.verify).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.any(String),
			expect.any(String),
			expect.any(String),
			"deepseek",
			{ temperature: 0.7 }
		);
	});

	it("should verify and add warning on failure", async () => {
		mockVerifier.verify.mockResolvedValue({
			passed: false,
			score: 5,
			reasoning: "Too simple",
		});

		await step.execute(mockContext, mockNext);

		expect(mockVerifier.verify).toHaveBeenCalledWith(
			"Virtual Machine",
			"Sanal Makine",
			"en",
			"tr",
			"tech",
			undefined, // Default provider
			undefined // Default options
		);
		expect(mockContext.qualityResult.issues.length).toBe(1);
		expect(mockContext.qualityResult.issues[0].message).toContain("Too simple");
		expect(mockNext).toHaveBeenCalled();
	});

	it("should not add warning on success", async () => {
		mockVerifier.verify.mockResolvedValue({
			passed: true,
			score: 9,
		});

		await step.execute(mockContext, mockNext);

		expect(mockContext.qualityResult.issues.length).toBe(0);
		expect(mockNext).toHaveBeenCalled();
	});

	it("should handle verifier errors gracefully", async () => {
		mockVerifier.verify.mockRejectedValue(new Error("Network error"));
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await step.execute(mockContext, mockNext);

		expect(mockNext).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
