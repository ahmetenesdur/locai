import PipelineStep from "../PipelineStep.js";

class InputValidationStep extends PipelineStep {
	constructor(maxKeyLength = 10000) {
		super();
		this.maxKeyLength = maxKeyLength;
	}

	async execute(context, next) {
		if (typeof context.sourceText !== "string") {
			context.result.error = "Invalid input type: sourceText must be a string";
			context.result.success = false;
			// Stop pipeline, return error
			return;
		}

		if (context.key.length > this.maxKeyLength) {
			context.result.key = context.key.substring(0, 100) + "...";
			context.result.translated = context.sourceText;
			context.result.error = `Key exceeds maximum length of ${this.maxKeyLength} characters`;
			context.result.success = false;
			// Stop pipeline
			return;
		}

		await next();
	}
}

export default InputValidationStep;
