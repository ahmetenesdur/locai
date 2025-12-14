import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { ToneVerifier } from "../../../utils/quality/tone-verifier.js";

export class ToneCheckStep extends PipelineStep {
	private verifier: ToneVerifier;
	private enabled: boolean;
	private debug: boolean;

	constructor(config: { enabled?: boolean; debug?: boolean } = {}) {
		super();
		this.verifier = new ToneVerifier();
		this.enabled = config.enabled || false;
		this.debug = config.debug || false;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		// Only run if enabled and we have a translation
		if (!this.enabled || !context.translatedText || !context.options?.styleGuide?.toneOfVoice) {
			await next();
			return;
		}

		try {
			if (this.debug) {
				console.log(
					`[ToneCheck] Verifying "${context.key}" against tone: ${context.options.styleGuide.toneOfVoice}`
				);
			}

			const styleGuide = context.options.styleGuide;
			const provider = styleGuide.toneProvider;
			const options = styleGuide.analysisOptions;

			const result = await this.verifier.verify(
				context.sourceText,
				context.translatedText,
				context.sourceLang,
				context.targetLang,
				styleGuide.toneOfVoice,
				provider,
				options
			);

			if (!result.passed) {
				if (this.debug) {
					console.warn(
						`[ToneCheck] Failed: Score ${result.score}/10. Reason: ${result.reasoning}`
					);
				}

				// Mark in context that tone validation failed
				// We can define a standard structure for quality warnings
				const qualityResult = (context as any).qualityResult || { issues: [] };
				qualityResult.issues.push({
					type: "tone_mismatch",
					message: result.reasoning,
					severity: "warning",
					suggestion: result.suggestions,
					score: result.score,
				});
				(context as any).qualityResult = qualityResult;

				// Optionally, if we want to enforce REJECTION, we could clear translatedText
				// For now, per plan, we are adding warnings/feedback loop potential.
				// context.translatedText = null; // Uncomment to strict enforce
			} else {
				if (this.debug) {
					console.log(`[ToneCheck] Passed: Score ${result.score}/10`);
				}
			}
		} catch (error) {
			console.error("[ToneCheck] Error executing verification:", error);
		}

		await next();
	}
}

export default ToneCheckStep;
