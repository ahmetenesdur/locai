import { SourceCodeAnalyzer } from "../src/services/source-analyzer.js"; // Note .js extension for ESM usage in TS if needed, or check project config. Usually .js for mapped paths.
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";

describe("Deep Context Analysis", () => {
	let analyzer: SourceCodeAnalyzer;
	const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
	const fixturePath = path.join(fixturesDir, "DeepContextTest.tsx");

	beforeAll(async () => {
		analyzer = new SourceCodeAnalyzer(process.cwd());
		// Initialize specifically with the fixture file
		await analyzer.initialize([fixturePath]);
	});

	it("extracts component name correctly", () => {
		const context = analyzer.getContext("action.save.tooltip");
		expect(context).toBeDefined();
		expect(context?.component).toBe("DeepContextTestComponent");
	});

	it("extracts props from JSX ancestor (when used in prop)", () => {
		const context = analyzer.getContext("action.save.tooltip");
		expect(context).toBeDefined();
		expect(context?.props).toBeDefined();
		expect(context?.props?.variant).toBe("primary");
		expect(context?.props?.title).toBeDefined(); // It captures itself too usually
	});

	it("extracts context from children usage", () => {
		const context = analyzer.getContext("action.save.label");
		expect(context).toBeDefined();
		expect(context?.component).toBe("DeepContextTestComponent");
		// Should NOT have props because it's not a prop usage, it's a child usage
		// (Based on current implementation logic)
		expect(context?.props).toBeUndefined();
	});

	it('extracts variable name as "component" for const arrow functions', () => {
		const context = analyzer.getContext("global.error");
		expect(context).toBeDefined();
		expect(context?.component).toBe("helper");
	});

	it("handles async initialization race condition safely", async () => {
		const raceAnalyzer = new SourceCodeAnalyzer(process.cwd());
		// Start initialization but don't await immediately
		raceAnalyzer.initialize([fixturePath]);

		// At this specific nanosecond, it's highly likely map is empty
		// This confirms that we NEED to await it
		const earlyContext = raceAnalyzer.getContext("action.save.tooltip");
		expect(earlyContext).toBeUndefined();

		// Now wait
		await raceAnalyzer.ensureInitialized();

		const lateContext = raceAnalyzer.getContext("action.save.tooltip");
		expect(lateContext).toBeDefined();
	});
});
