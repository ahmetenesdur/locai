/**
 * Base class for pipeline steps.
 * All steps should extend this or implement the execute method.
 */
class PipelineStep {
	/**
	 * Name of the step for debugging/logging purposes.
	 * @returns {string}
	 */
	get name() {
		return this.constructor.name;
	}

	/**
	 * Execute the step logic.
	 * @param {Object} _context - Translation context.
	 * @param {Function} _next - Next step callback.
	 */
	async execute(_context, _next) {
		throw new Error("execute method must be implemented by subclass");
	}
}

export default PipelineStep;
