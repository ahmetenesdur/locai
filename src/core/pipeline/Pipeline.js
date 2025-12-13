/**
 * Generic Pipeline class implementing the middleware pattern.
 * Allows composing a sequence of steps that can process a context object.
 */
class Pipeline {
	constructor() {
		this.steps = [];
	}

	/**
	 * Add a step to the pipeline.
	 * @param {Object} step - A step instance with an execute(context, next) method.
	 * @returns {Pipeline} - Returns self for chaining.
	 */
	use(step) {
		if (!step || typeof step.execute !== "function") {
			throw new Error("Pipeline step must implement an execute(context, next) method.");
		}
		this.steps.push(step);
		return this;
	}

	/**
	 * Execute the pipeline with the given context.
	 * @param {Object} context - The context object to be processed.
	 * @returns {Promise<Object>} - The processed context.
	 */
	async execute(context) {
		if (!context) {
			throw new Error("Pipeline execution requires a context object.");
		}

		const runner = async (index) => {
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
