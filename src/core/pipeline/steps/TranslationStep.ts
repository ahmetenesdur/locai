import PipelineStep from "../PipelineStep.js";
import ProviderFactory, { AIProvider } from "../../provider-factory.js";
import { TranslationContext } from "../context.js";
import type { TranslateOptions } from "../../../providers/base-provider.js";
import type { ConfidenceResult } from "../../../utils/confidence-scorer.js";

/** A low-confidence translation saved for manual review (`localize review`). */
export interface ReviewQueueItem {
	key: string;
	source: string;
	translation?: string;
	confidence: ConfidenceResult;
	language: string;
	sourceLang: string;
	category: string;
	timestamp: string;
}

export interface ConfidenceSettings {
	enabled: boolean;
	autoApproveThreshold: number;
	rejectThreshold: number;
	reviewThreshold: number;
	saveReviewQueue: boolean;
	reviewQueue: ReviewQueueItem[];
	autoApprovedCount: number;
	rejectedCount: number;
}

/** Options TranslationStep reads; the whole object is also forwarded to the provider. */
export interface TranslationStepOptions extends TranslateOptions {
	apiProvider?: string;
	useFallback?: boolean;
	fallbackOrder?: string[];
}

/**
 * A provider that can score its own translations: it returns the raw response when asked
 * and extracts the translation plus a confidence score from it.
 */
interface ConfidenceScoringProvider extends AIProvider {
	name?: string;
	translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options?: TranslateOptions & { returnRawResponse?: boolean }
	): Promise<string>;
	extractTranslationWithConfidence(
		response: string,
		providerName: string,
		sourceText: string,
		sourceLang: string,
		targetLang: string,
		category?: string
	): { translation: string; confidence: ConfidenceResult };
}

const supportsConfidenceScoring = (provider: AIProvider): provider is ConfidenceScoringProvider =>
	"extractTranslationWithConfidence" in provider &&
	typeof provider.extractTranslationWithConfidence === "function";

class TranslationStep extends PipelineStep {
	private options: TranslationStepOptions;
	private confidenceSettings: Partial<ConfidenceSettings>;

	constructor(
		options: TranslationStepOptions = {},
		confidenceSettings: Partial<ConfidenceSettings> = {}
	) {
		super();
		this.options = options;
		this.confidenceSettings = confidenceSettings;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		try {
			const provider = this._getProvider();

			// Setup translation options
			const translationOpts = {
				...this.options,
				detectedContext: {
					...context.meta,
					existingTranslation: context.existingTranslation || null,
				},
			};

			// Handling Confidence Scoring if enabled
			if (this.confidenceSettings.enabled && supportsConfidenceScoring(provider)) {
				const rawResponse = await provider.translate(
					context.protectedText || context.sourceText,
					context.sourceLang,
					context.targetLang,
					{ ...translationOpts, returnRawResponse: true }
				);

				const result = provider.extractTranslationWithConfidence(
					rawResponse,
					provider.name || "unknown",
					context.protectedText || context.sourceText,
					context.sourceLang,
					context.targetLang,
					context.meta?.category
				);

				context.translatedText = result.translation;
				context.confidence = result.confidence;
			} else {
				// Standard translation
				context.translatedText = await provider.translate(
					context.protectedText || context.sourceText,
					context.sourceLang,
					context.targetLang,
					translationOpts
				);
				context.confidence = undefined; // Use undefined instead of null for optional typings often
			}

			// Continue to next steps (restore glossary, quality check, etc.)
			await next();
		} catch (error) {
			console.error(`Translation error - key "${context.key}":`, error);
			context.result.error = error instanceof Error ? error.message : String(error);
			context.result.success = false;
			context.result.translated = context.sourceText; // Fallback to source
			// Stop pipeline or proceed?
			// Usually if translation fails, we stop quality checks but we might want to return the error result.
			// Since we set context.result, returning here is fine.
			return;
		}
	}

	_getProvider(): AIProvider {
		const provider = ProviderFactory.getProvider(
			this.options.apiProvider,
			this.options.useFallback !== false,
			this.options
		);

		if (!provider || typeof provider.translate !== "function") {
			throw new Error(
				`Translation provider not available or invalid: ${this.options.apiProvider}`
			);
		}
		return provider;
	}
}

export default TranslationStep;
