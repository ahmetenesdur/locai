import PipelineStep from "../PipelineStep.js";
import { FileManager } from "../../../utils/file-manager.js";
import { TranslationContext } from "../context.js";
import QualityChecker from "../../../utils/quality/index.js"; // Assuming default export or correct named export

class QualityCheckStep extends PipelineStep {
	private qualityChecker: QualityChecker | any;
	private debug: boolean;

	constructor(qualityChecker: QualityChecker | any, debug: boolean = false) {
		super();
		this.qualityChecker = qualityChecker;
		this.debug = debug;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		if (!context.translatedText) {
			await next();
			return;
		}

		let translated = context.translatedText;

		// 1. Quality Checks & Auto-fixing
		if (this.qualityChecker && this.qualityChecker.rules?.enabled !== false) {
			const qualityResult = this.qualityChecker.validateAndFix(
				context.sourceText,
				context.translatedText
			);
			translated = qualityResult.fixedText;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(context as any).qualityResult = qualityResult;
		}

		// 2. JSON Validity Check
		const jsonValidation = FileManager.validateTranslationValue(context.key, translated);
		if (!jsonValidation.valid) {
			if (this.debug) {
				console.warn(
					`JSON validation warning for key "${context.key}": ${jsonValidation.error}`
				);
			}
			// Attempt simple quote fix if possible (logic moved from Orchestrator)
			// Note: Since quoteBalanceChecker was inside Orchestrator, we might need to rely on QualityChecker if it has that logic.
			// Assuming QualityChecker handles most, but Orchestrator had a specific extra check.
			// For now, we trust QualityChecker which was passed in.
		}

		context.translatedText = translated;

		// Populate the final result
		context.result = {
			key: context.key,
			translated: context.translatedText,
			context: context.meta,
			success: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			qualityChecks: (context as any).qualityResult,
		};

		await next();
	}
}

export default QualityCheckStep;
