import PipelineStep from "../PipelineStep.js";
import ProviderFactory, { AIProvider } from "../../provider-factory.js";
import { TranslationContext } from "../context.js";
import { ProviderConfig } from "../../../providers/base-provider.js";

export interface ConfidenceSettings {
	enabled: boolean;
	autoApproveThreshold: number;
	rejectThreshold: number;
	reviewThreshold: number;
	saveReviewQueue: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	reviewQueue: any[];
	autoApprovedCount: number;
	rejectedCount: number;
	[key: string]: any;
}

class TranslationStep extends PipelineStep {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private options: any;
	private confidenceSettings: Partial<ConfidenceSettings>;

	constructor(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		options: any = {},
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
			if (
				this.confidenceSettings.enabled &&
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				typeof (provider as any).extractTranslationWithConfidence === "function"
			) {
				const rawResponse = await provider.translate(
					context.protectedText || context.sourceText,
					context.sourceLang,
					context.targetLang,
					{ ...translationOpts, returnRawResponse: true }
				);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const result = (provider as any).extractTranslationWithConfidence(
					rawResponse,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(provider as any).name || "unknown",
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
		} catch (error: any) {
			console.error(`Translation error - key "${context.key}":`, error);
			context.result.error = error.message;
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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!provider || typeof provider.translate !== "function") {
			throw new Error(
				`Translation provider not available or invalid: ${this.options.apiProvider}`
			);
		}
		return provider;
	}
}

export default TranslationStep;
