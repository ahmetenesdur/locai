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

	it("takes the props of the enclosing element for children usage", () => {
		const context = analyzer.getContext("action.save.label");
		expect(context).toBeDefined();
		expect(context?.component).toBe("DeepContextTestComponent");
		expect(context?.props?.variant).toBe("primary");

		expect(analyzer.getContext("delete.confirm")?.props).toEqual({
			variant: "danger",
			size: "sm",
		});
	});

	it('extracts variable name as "component" for const arrow functions', () => {
		const context = analyzer.getContext("global.error");
		expect(context).toBeDefined();
		expect(context?.component).toBe("helper");
	});

	it("names the enclosing component, not a local variable or event handler", () => {
		expect(analyzer.getContext("delete.title")?.component).toBe("DeleteDialog");
		expect(analyzer.getContext("delete.failed")?.component).toBe("DeleteDialog");
	});

	it("extracts the comment above the JSX attribute that holds the call", () => {
		expect(analyzer.getContext("action.save.tooltip")?.comments).toEqual([
			"context: tooltip for save button",
		]);
	});

	it("extracts a {/* JSX comment */} placed right before the JSX child", () => {
		expect(analyzer.getContext("action.save.label")?.comments).toEqual([
			"context: main button label",
		]);
	});

	it("extracts the comment above the enclosing function", () => {
		expect(analyzer.getContext("global.error")?.comments).toEqual(["context: Global helper"]);
	});

	it("lists the nearest comments first and leaves out tooling directives", () => {
		expect(analyzer.getContext("delete.confirm")?.comments).toEqual([
			"context: destructive action, keep it short",
			"Confirmation dialog shown before a project is deleted.",
		]);
		// `// eslint-disable-next-line no-console` sits right above this call's statement
		expect(analyzer.getContext("delete.failed")?.comments).toEqual([
			"Confirmation dialog shown before a project is deleted.",
		]);
	});

	it("uses the surrounding code without comments as the usage snippet", () => {
		const snippet = analyzer.getContext("action.save.tooltip")?.usageSnippet;
		expect(snippet).toContain('<div title={t("action.save.tooltip")} variant="primary">');
		expect(snippet).not.toContain("context:");

		expect(analyzer.getContext("delete.title")?.usageSnippet).toBe(
			'const title = t("delete.title");'
		);
	});

	it("keeps the snippet within 200 characters by using the largest part that fits", () => {
		// The whole `const columns = [...]` statement is longer than 200 characters.
		expect(analyzer.getContext("members.email")?.usageSnippet).toBe(
			'{ header: t("members.email"), accessor: "email", sortable: true, width: 240 }'
		);
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
