import { describe, it, expect } from "vitest";
import Pipeline from "../../../../src/core/pipeline/Pipeline.js";
import PipelineStep from "../../../../src/core/pipeline/PipelineStep.js";
import {
	createTranslationContext,
	PipelineOptions,
	TranslationContext,
} from "../../../../src/core/pipeline/context.js";

class MockStep extends PipelineStep {
	constructor(private fn: (ctx: TranslationContext, next: () => Promise<void>) => Promise<void>) {
		super();
	}
	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		await this.fn(context, next);
	}
}

const options: PipelineOptions = {
	source: "en",
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
};

describe("Pipeline", () => {
	it("should execute steps in order", async () => {
		const pipeline = new Pipeline();
		const callOrder: string[] = [];
		const context = createTranslationContext("key", "text", "en", "es", options);

		pipeline.use(
			new MockStep(async (ctx, next) => {
				callOrder.push("step1-start");
				await next();
				callOrder.push("step1-end");
			})
		);

		pipeline.use(
			new MockStep(async (ctx, next) => {
				callOrder.push("step2");
				await next();
			})
		);

		await pipeline.execute(context);

		expect(callOrder).toEqual(["step1-start", "step2", "step1-end"]);
	});

	it("should handle context modification", async () => {
		const pipeline = new Pipeline();
		const context = createTranslationContext("key", "original", "en", "es", options);

		pipeline.use(
			new MockStep(async (ctx, next) => {
				ctx.sourceText = "modified";
				await next();
			})
		);

		const result = await pipeline.execute(context);
		expect(result.sourceText).toBe("modified");
	});

	it("should throw if step is invalid", () => {
		const pipeline = new Pipeline();
		// @ts-expect-error -- not a PipelineStep: exercises the runtime check
		expect(() => pipeline.use({})).toThrow();
	});

	it("should throw if context is missing", async () => {
		const pipeline = new Pipeline();
		// @ts-expect-error -- no context: exercises the runtime check
		await expect(pipeline.execute(null)).rejects.toThrow();
	});
});
