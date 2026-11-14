import PipelineStep from "../PipelineStep.js";
import ProviderFactory, { AIProvider } from "../../provider-factory.js";
import { TranslationContext } from "../context.js";
import type { TranslateOptions } from "../../../providers/base-provider.js";
import ConfidenceScorer from "../../../utils/confidence-scorer.js";
import type { ReviewQueueItem, TranslationRef } from "../../../utils/review-queue.js";

export interface ConfidenceSettings {
	enabled: boolean;
	autoApproveThreshold: number;
	rejectThreshold: number;
	reviewThreshold: number;
	saveReviewQueue: boolean;
	/** Translations scored below reviewThreshold in this run, rejected ones included. */
	reviewQueue: ReviewQueueItem[];
	/** Every translation scored in this run. */
	scored: TranslationRef[];
	autoApprovedCount: number;
	rejectedCount: number;
}

/** Options TranslationStep reads; the whole object is also forwarded to the provider. */
export interface TranslationStepOptions extends TranslateOptions {
	apiProvider?: string;
	useFallback?: boolean;
	fallbackOrder?: string[];
}

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
			const text = context.protectedText || context.sourceText;

			// Setup translation options
			const translationOpts = {
				...this.options,
				detectedContext: {
					...context.meta,
					existingTranslation: context.existingTranslation || null,
				},
			};

			context.translatedText = await provider.translate(
				text,
				context.sourceLang,
				context.targetLang,
				translationOpts
			);

			// Score what the provider returned, before glossary restoration and quality fixes
			if (this.confidenceSettings.enabled) {
				context.confidence = ConfidenceScorer.calculateConfidence({
					sourceText: text,
					translation: context.translatedText,
					sourceLang: context.sourceLang,
					targetLang: context.targetLang,
					provider: this.options.apiProvider?.toLowerCase() || "unknown",
					category: context.meta?.category,
				});
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
