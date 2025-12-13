/**
 * Base class for pipeline steps.
 * All steps should extend this or implement the execute method.
 */
class PipelineStep {
    /**
     * Name of the step for debugging/logging purposes.
     */
    get name() {
        return this.constructor.name;
    }
}
export default PipelineStep;
