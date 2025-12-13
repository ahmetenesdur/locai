import PipelineStep from "../PipelineStep.js";
import ProviderFactory from "../../provider-factory.js";

class TranslationStep extends PipelineStep {
	constructor(options = {}, confidenceSettings = {}) {
		super();
		this.options = options;
		this.confidenceSettings = confidenceSettings;
	}

	async execute(context, next) {
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
				typeof provider.extractTranslationWithConfidence === "function"
			) {
				const rawResponse = await provider.translate(
					context.protectedText || context.sourceText,
					context.sourceLang,
					context.targetLang,
					{ ...translationOpts, returnRawResponse: true }
				);

				const result = provider.extractTranslationWithConfidence(
					rawResponse,
					provider.name,
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
				context.confidence = null;
			}

			// Continue to next steps (restore glossary, quality check, etc.)
			await next();
		} catch (error) {
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

	_getProvider() {
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
