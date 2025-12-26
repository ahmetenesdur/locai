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
					// Enrich the context meta
					context.meta = {
						...context.meta,
						code: codeContext,
					};

					// Also append to the AI prompt context if it exists
					// (Assuming existing translation prompt uses contextData)
					context.contextData = {
						...(context.contextData || {}),
						visualContext: {
							component: codeContext.component,
							file: codeContext.filePath,
							comments: codeContext.comments,
							props: codeContext.props,
							snippet: codeContext.usageSnippet,
						},
					};
				}
			} catch (error) {
				// Non-blocking error
				// console.warn(`Context enrichment failed for ${context.key}`, error);
			}
		}

		await next();
	}
}
