import { describe, it, expect } from "vitest";
import ConfidenceCheckStep from "../../../../../src/core/pipeline/steps/ConfidenceCheckStep.js";
import {
	createTranslationContext,
	PipelineOptions,
	TranslationContext,
} from "../../../../../src/core/pipeline/context.js";
import type { ConfidenceResult } from "../../../../../src/utils/confidence-scorer.js";

const pipelineOptions: PipelineOptions = {
	source: "en",
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
};

const thresholds = {
	enabled: true,
	autoApproveThreshold: 0.9,
	reviewThreshold: 0.7,
	rejectThreshold: 0.5,
};

/** A translated context, as QualityCheckStep leaves it, with the given confidence score. */
const scoredContext = (score: number): TranslationContext => {
	const context = createTranslationContext("greeting", "Hello", "en", "es", pipelineOptions);
	context.translatedText = "Hola";
	context.result = { key: "greeting", translated: "Hola", success: true, context: {} };
	const confidence: ConfidenceResult = {
		score,
		level: "low",
		qualityScore: score,
		details: { categoryAdjustment: 1, languageFactor: 1, providerReliability: 1 },
		issues: [],
	};
	context.confidence = confidence;
	return context;
};

describe("ConfidenceCheckStep", () => {
	it("should reject a translation below the reject threshold so it is not written", async () => {
		const context = scoredContext(0.4);

		await new ConfidenceCheckStep(thresholds).execute(context, async () => {});

		expect(context.result).toMatchObject({
			success: false,
			rejected: true,
			translated: "Hola",
			confidence: { score: 0.4 },
			error: expect.stringContaining("reject threshold 0.5"),
		});
		expect(context.result.needsReview).toBeUndefined();
	});

	it("should flag a translation below the review threshold for review", async () => {
		const context = scoredContext(0.6);

		await new ConfidenceCheckStep(thresholds).execute(context, async () => {});

		expect(context.result).toMatchObject({ success: true, needsReview: true });
		expect(context.result.rejected).toBeUndefined();
		expect(context.result.autoApproved).toBeUndefined();
	});

	it("should auto-approve a translation at the auto-approve threshold", async () => {
		const context = scoredContext(0.9);

		await new ConfidenceCheckStep(thresholds).execute(context, async () => {});

		expect(context.result).toMatchObject({ success: true, autoApproved: true });
		expect(context.result.needsReview).toBeUndefined();
	});

	it("should flag rather than auto-approve when the review threshold is the higher one", async () => {
		const context = scoredContext(0.92);

		await new ConfidenceCheckStep({ ...thresholds, reviewThreshold: 0.95 }).execute(
			context,
			async () => {}
		);

		expect(context.result).toMatchObject({ success: true, needsReview: true });
		expect(context.result.autoApproved).toBeUndefined();
	});

	it("should leave the result alone when confidence scoring is disabled", async () => {
		const context = scoredContext(0.4);

		await new ConfidenceCheckStep({ ...thresholds, enabled: false }).execute(
			context,
			async () => {}
		);

		expect(context.result).toEqual({
			key: "greeting",
			translated: "Hola",
			success: true,
			context: {},
		});
	});
});
