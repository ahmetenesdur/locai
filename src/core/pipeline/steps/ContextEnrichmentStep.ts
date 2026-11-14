import PipelineStep from "../PipelineStep.js";
import { TranslationContext } from "../context.js";
import { SourceCodeAnalyzer } from "../../../services/source-analyzer.js";

export default class ContextEnrichmentStep extends PipelineStep {
	private analyzer: SourceCodeAnalyzer;
	private enabled: boolean;

	constructor(analyzer: SourceCodeAnalyzer, enabled: boolean = true) {
		super();
		this.analyzer = analyzer;
		this.enabled = enabled;
	}

	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		if (this.enabled) {
			try {
				// Ensure analysis is complete before checking for context
				await this.analyzer.ensureInitialized();

				const codeContext = this.analyzer.getContext(context.key);

				if (codeContext) {
					// TranslationStep forwards meta to the provider as `detectedContext`,
					// and the prompt templates render `code` (see prompt-templates.ts).
					context.meta = {
						...context.meta,
						code: codeContext,
					};
				}
			} catch {
				// Non-blocking error
				// console.warn(`Context enrichment failed for ${context.key}`, error);
			}
		}

		await next();
	}
}
