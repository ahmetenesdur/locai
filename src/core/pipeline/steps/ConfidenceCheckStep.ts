import PipelineStep from "../PipelineStep.js";
import { log } from "../../../utils/logger.js";
import { TranslationContext } from "../context.js";
import { ConfidenceSettings } from "./TranslationStep.js";

/**
 * Classifies a scored translation by the confidence thresholds: below rejectThreshold it is
 * rejected (the result fails, so the translation is not written), below reviewThreshold it
 * needs review, at or above autoApproveThreshold it is auto-approved.
 */
class ConfidenceCheckStep extends PipelineStep {
	private confidenceSettings: Partial<ConfidenceSettings>;
	private debug: boolean;

	constructor(confidenceSettings: Partial<ConfidenceSettings>, debug: boolean = false) {
		super();
		this.confidenceSettings = confidenceSettings;
		this.debug = debug;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		const { confidence, result } = context;
		if (!this.confidenceSettings.enabled || !confidence || !result.success) {
			await next();
			return;
		}

		const {
			autoApproveThreshold = 0.9,
			reviewThreshold = 0.7,
			rejectThreshold = 0.5,
		} = this.confidenceSettings;
		const score = confidence.score;

		result.confidence = confidence;

		let outcome = "Accepted";
		if (score < rejectThreshold) {
			outcome = "Rejected";
			result.rejected = true;
			result.rejectionReason = `Confidence ${score.toFixed(3)} is below the reject threshold ${rejectThreshold}`;
			result.error = result.rejectionReason;
			result.success = false;
		} else if (score < reviewThreshold) {
			outcome = "Needs review";
			result.needsReview = true;
		} else if (score >= autoApproveThreshold) {
			outcome = "Auto-approved";
			result.autoApproved = true;
		}

		if (this.debug) {
			log(`${outcome}: ${context.key} (score: ${score.toFixed(3)})`, true);
		}

		await next();
	}
}

export default ConfidenceCheckStep;
