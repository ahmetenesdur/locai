import { describe, it, expect, vi } from "vitest";
import Pipeline from "../../../../src/core/pipeline/Pipeline.js";
import PipelineStep from "../../../../src/core/pipeline/PipelineStep.js";
import { TranslationContext } from "../../../../src/core/pipeline/context.js";

class MockStep extends PipelineStep {
	constructor(private fn: (ctx: TranslationContext, next: () => Promise<void>) => Promise<void>) {
		super();
	}
	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		await this.fn(context, next);
	}
}

describe("Pipeline", () => {
	it("should execute steps in order", async () => {
		const pipeline = new Pipeline();
		const callOrder: string[] = [];
		const context = {} as TranslationContext;

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
		const context = { sourceText: "original" } as TranslationContext;

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
		expect(() => pipeline.use({} as any)).toThrow();
	});

	it("should throw if context is missing", async () => {
		const pipeline = new Pipeline();
		await expect(pipeline.execute(null as any)).rejects.toThrow();
	});
});
