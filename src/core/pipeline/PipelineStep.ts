import { TranslationContext } from "./context.js";

/**
 * Base class for pipeline steps.
 * All steps should extend this or implement the execute method.
 */
abstract class PipelineStep {
	/**
	 * Name of the step for debugging/logging purposes.
	 */
	get name(): string {
		return this.constructor.name;
	}

	/**
	 * Execute the step logic.
	 * @param context - Translation context.
	 * @param next - Next step callback.
	 */
	abstract execute(context: TranslationContext, next: () => Promise<void>): Promise<void>;
}

export default PipelineStep;
