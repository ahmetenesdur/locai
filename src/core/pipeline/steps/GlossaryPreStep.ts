import PipelineStep from "../PipelineStep.js";
import GlossaryManager from "../../../utils/glossary-manager.js";
import { TranslationContext } from "../context.js";

class GlossaryPreStep extends PipelineStep {
	private glossaryManager?: GlossaryManager | null;

	constructor(glossaryManager?: GlossaryManager | null) {
		super();
		this.glossaryManager = glossaryManager;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		if (!this.glossaryManager) {
			context.protectedText = context.sourceText;
			await next();
			return;
		}

		const { protectedText, termMap } = this.glossaryManager.protectTerms(
			context.sourceText,
			context.sourceLang,
			context.targetLang
		);

		context.protectedText = protectedText;
		context.termMap = termMap;

		await next();
	}
}

export default GlossaryPreStep;
