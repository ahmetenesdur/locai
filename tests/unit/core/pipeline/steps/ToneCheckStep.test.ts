import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ToneCheckStep } from "../../../../../src/core/pipeline/steps/ToneCheckStep.js";
import {
	createTranslationContext,
	PipelineOptions,
	TranslationContext,
} from "../../../../../src/core/pipeline/context.js";
import type { ToneVerifier } from "../../../../../src/utils/quality/tone-verifier.js";
import type { StyleGuideConfig } from "../../../../../src/utils/quality/style-guide-checker.js";

// Every ToneVerifier instance shares this mock
const verifyMock = vi.hoisted(() => vi.fn<ToneVerifier["verify"]>());

vi.mock("../../../../../src/utils/quality/tone-verifier.js", () => {
	return {
		ToneVerifier: class {
			verify = verifyMock;
		},
	};
});

describe("ToneCheckStep", () => {
	let step: ToneCheckStep;
	let styleGuide: StyleGuideConfig;
	let mockContext: TranslationContext;
	let mockNext: Mock<() => Promise<void>>;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		step = new ToneCheckStep({ enabled: true });
		styleGuide = { toneOfVoice: "tech" };
		const options: PipelineOptions = {
			source: "en",
			context: {
				categories: {},
				detection: { threshold: 2, minConfidence: 0.6 },
				fallback: { category: "general", prompt: "Provide a natural translation" },
			},
			styleGuide,
		};
		mockContext = {
			...createTranslationContext("key", "Virtual Machine", "en", "tr", options),
			translatedText: "Sanal Makine",
			qualityResult: {
				issues: [],
			},
		};
		mockNext = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
	});

	it("should skip verification if disabled", async () => {
		const disabledStep = new ToneCheckStep({ enabled: false });
		await disabledStep.execute(mockContext, mockNext);
		expect(verifyMock).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should skip verification if no translated text", async () => {
		mockContext.translatedText = "";
		await step.execute(mockContext, mockNext);
		expect(verifyMock).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should skip verification if no tone defined", async () => {
		styleGuide.toneOfVoice = undefined;
		await step.execute(mockContext, mockNext);
		expect(verifyMock).not.toHaveBeenCalled();
		expect(mockNext).toHaveBeenCalled();
	});

	it("should pass configured provider to verifier", async () => {
		styleGuide.toneProvider = "gemini";
		verifyMock.mockResolvedValue({ passed: true, score: 10, reasoning: "Matches tone" });

		await step.execute(mockContext, mockNext);

		expect(verifyMock).toHaveBeenCalledWith(
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
		styleGuide.toneProvider = "deepseek";
		styleGuide.analysisOptions = { temperature: 0.7 };
		verifyMock.mockResolvedValue({ passed: true, score: 10, reasoning: "Matches tone" });

		await step.execute(mockContext, mockNext);

		expect(verifyMock).toHaveBeenCalledWith(
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
		verifyMock.mockResolvedValue({
			passed: false,
			score: 5,
			reasoning: "Too simple",
		});

		await step.execute(mockContext, mockNext);

		expect(verifyMock).toHaveBeenCalledWith(
			"Virtual Machine",
			"Sanal Makine",
			"en",
			"tr",
			"tech",
			undefined, // Default provider
			undefined // Default options
		);
		expect(mockContext.qualityResult?.issues).toHaveLength(1);
		expect(mockContext.qualityResult?.issues[0].message).toContain("Too simple");
		expect(mockNext).toHaveBeenCalled();
	});

	it("should not add warning on success", async () => {
		verifyMock.mockResolvedValue({
			passed: true,
			score: 9,
			reasoning: "Matches tone",
		});

		await step.execute(mockContext, mockNext);

		expect(mockContext.qualityResult?.issues).toHaveLength(0);
		expect(mockNext).toHaveBeenCalled();
	});

	it("should handle verifier errors gracefully", async () => {
		verifyMock.mockRejectedValue(new Error("Network error"));
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await step.execute(mockContext, mockNext);

		expect(mockNext).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
