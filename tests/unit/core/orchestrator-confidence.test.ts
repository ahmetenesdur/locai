import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import Orchestrator, { OrchestratorOptions } from "../../../src/core/orchestrator.js";
import ProviderFactory from "../../../src/core/provider-factory.js";

// The provider stands in for the HTTP API; the pipeline around it is real
vi.mock("../../../src/core/provider-factory.js", () => ({
	default: {
		getProvider: vi.fn(),
	},
}));

const baseOptions: OrchestratorOptions = {
	apiProvider: "openai",
	source: "en",
	deepContext: false,
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
	// Keep the provider's text as is, so the queued translation is what the stub returned
	qualityChecks: { enabled: false },
};

/** What the stub provider answers for each source text. */
const replies: Record<string, string> = {
	"Hello {name}": "Hola {name}",
	// Drops the placeholder: needs review
	"You have {count} messages": "Tienes mensajes",
	// Drops the tags and the placeholder: rejected
	"Delete <b>{file}</b>?": "¿Eliminar?",
};

describe("Orchestrator confidence scoring", () => {
	describe("settings", () => {
		it("should stay off by default and while confidenceScoring.enabled is false", () => {
			expect(new Orchestrator(baseOptions).confidenceSettings.enabled).toBe(false);
			expect(
				new Orchestrator({
					...baseOptions,
					confidenceScoring: {
						enabled: false,
						minConfidence: 0.7,
						saveReviewQueue: true,
					},
				}).confidenceSettings.enabled
			).toBe(false);
		});

		it("should turn on with minConfidence and flag below it, over the section's thresholds", () => {
			const { confidenceSettings } = new Orchestrator({
				...baseOptions,
				minConfidence: 0.85,
				confidenceScoring: { minConfidence: 0.7, reviewThreshold: 0.75 },
			});

			expect(confidenceSettings).toMatchObject({
				enabled: true,
				reviewThreshold: 0.85,
				autoApproveThreshold: 0.9,
				rejectThreshold: 0.5,
				saveReviewQueue: false,
			});
		});

		it("should turn on and save the review queue with saveReviewQueue", () => {
			const { confidenceSettings } = new Orchestrator({
				...baseOptions,
				saveReviewQueue: true,
			});

			expect(confidenceSettings).toMatchObject({
				enabled: true,
				reviewThreshold: 0.7,
				saveReviewQueue: true,
			});
		});

		it("should read the confidenceScoring section, using the higher review threshold", () => {
			const { confidenceSettings } = new Orchestrator({
				...baseOptions,
				confidenceScoring: {
					enabled: true,
					minConfidence: 0.6,
					reviewThreshold: 0.8,
					autoApproveThreshold: 0.95,
					rejectThreshold: 0,
					saveReviewQueue: true,
				},
			});

			expect(confidenceSettings).toMatchObject({
				enabled: true,
				reviewThreshold: 0.8,
				autoApproveThreshold: 0.95,
				rejectThreshold: 0,
				saveReviewQueue: true,
			});
		});
	});

	describe("scored translations", () => {
		let translate: Mock<(text: string) => Promise<string>>;

		beforeEach(() => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			translate = vi.fn((text: string) => Promise.resolve(replies[text]));
			vi.mocked(ProviderFactory.getProvider).mockReturnValue({ translate });
		});

		it("should count every scored translation and queue the flagged and rejected ones", async () => {
			const orchestrator = new Orchestrator({
				...baseOptions,
				confidenceScoring: { enabled: true },
			});

			const results = await orchestrator.processTranslations([
				{ key: "greeting", text: "Hello {name}", targetLang: "es" },
				{ key: "inbox", text: "You have {count} messages", targetLang: "es" },
				{ key: "delete", text: "Delete <b>{file}</b>?", targetLang: "es" },
			]);

			expect(results.map((result) => result.confidence?.score)).toEqual([
				expect.any(Number),
				expect.any(Number),
				expect.any(Number),
			]);
			const settings = orchestrator.confidenceSettings;
			expect(settings.scored).toEqual(
				expect.arrayContaining([
					{ language: "es", key: "greeting" },
					{ language: "es", key: "inbox" },
					{ language: "es", key: "delete" },
				])
			);
			expect(settings.autoApprovedCount).toBe(1);
			expect(settings.rejectedCount).toBe(1);
			expect(settings.reviewQueue).toHaveLength(2);
			expect(settings.reviewQueue).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						key: "inbox",
						language: "es",
						source: "You have {count} messages",
						translation: "Tienes mensajes",
						sourceLang: "en",
						category: "general",
						rejected: false,
					}),
					expect.objectContaining({
						key: "delete",
						translation: "¿Eliminar?",
						rejected: true,
					}),
				])
			);
		});

		it("should queue a flagged translation served from the cache for its own key too", async () => {
			const orchestrator = new Orchestrator({
				...baseOptions,
				confidenceScoring: { enabled: true },
			});

			await orchestrator.processTranslation("inbox", "You have {count} messages", "es", {});
			const cached = await orchestrator.processTranslation(
				"header.inbox",
				"You have {count} messages",
				"es",
				{}
			);

			expect(translate).toHaveBeenCalledTimes(1);
			expect(cached).toMatchObject({ fromCache: true, needsReview: true });
			expect(orchestrator.confidenceSettings.reviewQueue.map((item) => item.key)).toEqual([
				"inbox",
				"header.inbox",
			]);
		});
	});
});
