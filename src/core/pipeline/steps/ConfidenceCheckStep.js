import PipelineStep from "../PipelineStep.js";
import { log } from "../../../utils/logger.js";

class ConfidenceCheckStep extends PipelineStep {
	constructor(confidenceSettings, debug = false) {
		super();
		this.confidenceSettings = confidenceSettings;
		this.debug = debug;
	}

	async execute(context, next) {
		if (!context.confidence || !this.confidenceSettings.enabled) {
			await next();
			return;
		}

		const confidence = context.confidence;
		const result = context.result;

		result.confidence = confidence;

		// Auto-approve if above threshold
		if (confidence.score >= this.confidenceSettings.autoApproveThreshold) {
			result.autoApproved = true;
			this.confidenceSettings.autoApprovedCount++;

			if (this.debug) {
				log(`Auto-approved: ${context.key} (score: ${confidence.score.toFixed(3)})`, true);
			}
		}
		// Auto-reject if below threshold
		else if (confidence.score < this.confidenceSettings.rejectThreshold) {
			result.rejected = true;
			result.rejectionReason = `Quality score too low: ${confidence.score.toFixed(3)}`;
			this.confidenceSettings.rejectedCount++;

			if (this.debug) {
				log(`Auto-rejected: ${context.key} (score: ${confidence.score.toFixed(3)})`, true);
			}

			// Keep original text for rejected translations
			result.translated = context.sourceText;
		}
		// Add to review queue if below review threshold
		else if (
			this.confidenceSettings.saveReviewQueue &&
			confidence.score < this.confidenceSettings.reviewThreshold
		) {
			result.needsReview = true;

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

		await next();
	}
}

export default ConfidenceCheckStep;
