import PipelineStep from "./PipelineStep.js";
import { TranslationContext } from "./context.js";

/**
 * Generic Pipeline class implementing the middleware pattern.
 * Allows composing a sequence of steps that can process a context object.
 */
class Pipeline {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	steps: any[] = []; // allow loose typing initially for step inputs, but ideally PipelineStep

	constructor() {
		this.steps = [];
	}

	/**
	 * Add a step to the pipeline.
	 * @param step - A step instance with an execute(context, next) method.
	 * @returns - Returns self for chaining.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	use(step: PipelineStep | any): Pipeline {
		if (!step || typeof step.execute !== "function") {
			throw new Error("Pipeline step must implement an execute(context, next) method.");
		}
		this.steps.push(step);
		return this;
	}

	/**
	 * Execute the pipeline with the given context.
	 * @param context - The context object to be processed.
	 * @returns - The processed context.
	 */
	async execute(context: TranslationContext): Promise<TranslationContext> {
		if (!context) {
			throw new Error("Pipeline execution requires a context object.");
		}

		const runner = async (index: number): Promise<void> => {
			if (index >= this.steps.length) {
				return;
			}

			const step = this.steps[index];

			// Allow steps to call next() to proceed to the next step
			const next = async () => {
				await runner(index + 1);
			};

			await step.execute(context, next);
		};

		await runner(0);
		return context;
	}
}

export default Pipeline;
