import PipelineStep from "../PipelineStep.js";
import GlossaryManager from "../../../utils/glossary-manager.js";
import { TranslationContext } from "../context.js";

class GlossaryPostStep extends PipelineStep {
	private glossaryManager?: GlossaryManager | null;

	constructor(glossaryManager?: GlossaryManager | null) {
		super();
		this.glossaryManager = glossaryManager;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		if (!this.glossaryManager || !context.termMap || !context.translatedText) {
			await next();
			return;
		}

		context.translatedText = this.glossaryManager.restoreTerms(
			context.translatedText,
			context.termMap
		);

		await next();
	}
}

export default GlossaryPostStep;
