import { describe, it, expect } from "vitest";
import ConfidenceScorer, { ConfidenceOptions } from "../../../src/utils/confidence-scorer.js";

describe("ConfidenceScorer", () => {
	describe("calculateConfidence", () => {
		const baseOptions: ConfidenceOptions = {
			sourceText: "Hello world",
			translation: "Hola mundo",
			sourceLang: "en",
			targetLang: "es",
			provider: "openai",
			category: "general",
			aiConfidence: 0.9,
		};

		it("should calculate high confidence for good translations", () => {
			const result = ConfidenceScorer.calculateConfidence(baseOptions);

			expect(result.score).toBeGreaterThan(0.8);
			expect(result.level).toBe("high");
			expect(result.issues).toHaveLength(0);
		});

		it("should detect mismatch issues", () => {
			const options = {
				...baseOptions,
				sourceText: "Hello {name}",
				translation: "Hola mundo", // Missing placeholder
			};

			const result = ConfidenceScorer.calculateConfidence(options);

			expect(result.issues).toEqual(
				expect.arrayContaining([expect.objectContaining({ type: "placeholder" })])
			);
			expect(result.qualityScore).toBeLessThan(1.0);
		});

		it("should adjust for provider reliability", () => {
			const resultOpenAI = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				provider: "openai",
			});
			// Assume random provider has lower default reliability in code if not mapped
			const resultUnknown = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				provider: "unknown_provider",
			});

			// OpenAI is mapped to high reliability, unknown should be lower default
			expect(resultUnknown.details.providerReliability).toBeLessThanOrEqual(
				resultOpenAI.details.providerReliability
			);
		});

		it("should adjust for language pair complexity", () => {
			const resultEasy = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceLang: "en",
				targetLang: "es",
			});
			const resultHard = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceLang: "en",
				targetLang: "zh",
			}); // Complex

			expect(resultHard.details.languageFactor).toBeLessThan(
				resultEasy.details.languageFactor
			);
		});

		it("should punish lengths deviation", () => {
			const result = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceText: "Hello",
				translation: "This is a very very very long translation for a short word",
			});

			expect(result.issues).toEqual(
				expect.arrayContaining([expect.objectContaining({ type: "length" })])
			);
		});
	});

	describe("extractAIConfidence", () => {
		it("should extract from openai logprobs", () => {
			const response = {
				choices: [
					{
						logprobs: {
							token_logprobs: [-0.01, -0.02, -0.05], // All non-zero close to 0
						},
					},
				],
			};
			const conf = ConfidenceScorer.extractAIConfidence(response, "openai");
			expect(conf).toBeGreaterThan(0.9);
		});

		it("should fallback correctly", () => {
			const conf = ConfidenceScorer.extractAIConfidence({}, "unknown");
			expect(conf).toBe(0.8);
		});
	});

	describe("formatting", () => {
		it("should format score with color tag", () => {
			expect(ConfidenceScorer.formatConfidence(0.95)).toContain("[HIGH]");
			expect(ConfidenceScorer.formatConfidence(0.55)).toContain("[LOW]");
		});
	});
});
