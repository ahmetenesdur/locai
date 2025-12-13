import PipelineStep from "../PipelineStep.js";
class GlossaryPreStep extends PipelineStep {
    glossaryManager;
    constructor(glossaryManager) {
        super();
        this.glossaryManager = glossaryManager;
    }
    async execute(context, next) {
        if (!this.glossaryManager) {
            context.protectedText = context.sourceText;
            await next();
            return;
        }
        const { protectedText, termMap } = this.glossaryManager.protectTerms(context.sourceText, context.sourceLang, context.targetLang);
        context.protectedText = protectedText;
        context.termMap = termMap;
        await next();
    }
}
export default GlossaryPreStep;
