import PipelineStep from "../PipelineStep.js";

class GlossaryPostStep extends PipelineStep {
	constructor(glossaryManager) {
		super();
		this.glossaryManager = glossaryManager;
	}

	async execute(context, next) {
		if (!this.glossaryManager || !context.termMap || !context.translatedText) {
			return next();
		}

		context.translatedText = this.glossaryManager.restoreTerms(
			context.translatedText,
			context.termMap
		);

		await next();
	}
}

export default GlossaryPostStep;
