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
		};

		it("should score a clean translation at the default auto-approve threshold (0.9) or above", () => {
			const result = ConfidenceScorer.calculateConfidence(baseOptions);

			expect(result.score).toBeGreaterThanOrEqual(0.9);
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

		it("should apply language pair rules to tags with script or region subtags", () => {
			const plain = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceLang: "en",
				targetLang: "zh",
			});
			const tagged = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceLang: "en-US",
				targetLang: "zh-Hant-TW",
			});

			expect(tagged.details.languageFactor).toBe(plain.details.languageFactor);
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

		it.each([
			["placeholder", "You have {count} new messages.", "Tienes mensajes nuevos."],
			["html_tag", 'Read the <a href="/terms">terms</a> first.', "Lee primero los términos."],
			["untranslated", "Settings saved.", "Settings saved."],
			["ai_artifact", "Save your changes.", "Here is the translation: Guarda tus cambios."],
			["too_short", "Continue", "C"],
		])(
			"should score a translation with a %s problem below the default review threshold (0.7)",
			(type, sourceText, translation) => {
				const result = ConfidenceScorer.calculateConfidence({
					...baseOptions,
					sourceText,
					translation,
				});

				expect(result.score).toBeLessThan(0.7);
				expect(result.issues).toEqual(
					expect.arrayContaining([expect.objectContaining({ type })])
				);
			}
		);

		it("should score a translation with several problems below the default reject threshold (0.5)", () => {
			const result = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceText: "Delete <b>{file}</b>?",
				translation: "¿Eliminar?",
			});

			expect(result.score).toBeLessThan(0.5);
			expect(result.issues.map((issue) => issue.type)).toEqual(["placeholder", "html_tag"]);
		});

		it("should keep a translation with only a punctuation difference between the default thresholds", () => {
			const result = ConfidenceScorer.calculateConfidence({
				...baseOptions,
				sourceText: "Save changes.",
				translation: "Guardar cambios",
			});

			expect(result.score).toBeGreaterThanOrEqual(0.7);
			expect(result.score).toBeLessThan(0.9);
			expect(result.issues).toEqual([expect.objectContaining({ type: "punctuation" })]);
		});
	});

	describe("formatting", () => {
		it("should format score with color tag", () => {
			expect(ConfidenceScorer.formatConfidence(0.95)).toContain("[HIGH]");
			expect(ConfidenceScorer.formatConfidence(0.55)).toContain("[LOW]");
		});
	});
});
