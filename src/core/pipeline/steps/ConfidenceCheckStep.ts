import PipelineStep from "../PipelineStep.js";
import { log } from "../../../utils/logger.js";
import { TranslationContext } from "../context.js";
import { ConfidenceSettings } from "./TranslationStep.js";

class ConfidenceCheckStep extends PipelineStep {
	private confidenceSettings: Partial<ConfidenceSettings>;
	private debug: boolean;

	constructor(confidenceSettings: Partial<ConfidenceSettings>, debug: boolean = false) {
		super();
		this.confidenceSettings = confidenceSettings;
		this.debug = debug;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!(context as any).confidence || !this.confidenceSettings.enabled) {
			await next();
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const confidence = (context as any).confidence;
		const result: any = context.result;

		result.confidence = confidence;

		// Auto-approve if above threshold
		if (
			this.confidenceSettings.autoApproveThreshold !== undefined &&
			confidence.score >= this.confidenceSettings.autoApproveThreshold
		) {
			result.autoApproved = true;
			if (this.confidenceSettings.autoApprovedCount !== undefined) {
				this.confidenceSettings.autoApprovedCount++;
			}

			if (this.debug) {
				log(`Auto-approved: ${context.key} (score: ${confidence.score.toFixed(3)})`, true);
			}
		}
		// Auto-reject if below threshold
		else if (
			this.confidenceSettings.rejectThreshold !== undefined &&
			confidence.score < this.confidenceSettings.rejectThreshold
		) {
			result.rejected = true;
			result.rejectionReason = `Quality score too low: ${confidence.score.toFixed(3)}`;
			if (this.confidenceSettings.rejectedCount !== undefined) {
				this.confidenceSettings.rejectedCount++;
			}

			if (this.debug) {
				log(`Auto-rejected: ${context.key} (score: ${confidence.score.toFixed(3)})`, true);
			}

			// Keep original text for rejected translations
			result.translated = context.sourceText;
		}
		// Add to review queue if below review threshold
		else if (
			this.confidenceSettings.saveReviewQueue &&
			this.confidenceSettings.reviewThreshold !== undefined &&
			confidence.score < this.confidenceSettings.reviewThreshold
		) {
			result.needsReview = true;

			if (this.confidenceSettings.reviewQueue) {
				this.confidenceSettings.reviewQueue.push({
					key: context.key,
					source: context.sourceText,
					translation: context.translatedText,
					confidence,
					language: context.targetLang,
					sourceLang: context.options.source,
					category: context.meta?.category || "general",
					timestamp: new Date().toISOString(),
				});
			}
		}

		await next();
	}
}

export default ConfidenceCheckStep;
