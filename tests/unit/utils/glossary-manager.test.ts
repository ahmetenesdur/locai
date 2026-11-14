import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import GlossaryManager, { GlossaryConfig } from "../../../src/utils/glossary-manager.js";
import Pipeline from "../../../src/core/pipeline/Pipeline.js";
import PipelineStep from "../../../src/core/pipeline/PipelineStep.js";
import GlossaryPreStep from "../../../src/core/pipeline/steps/GlossaryPreStep.js";
import GlossaryPostStep from "../../../src/core/pipeline/steps/GlossaryPostStep.js";
import {
	createTranslationContext,
	PipelineOptions,
	TranslationContext,
} from "../../../src/core/pipeline/context.js";

const options: PipelineOptions = {
	source: "en",
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
};

/** Stands in for the AI: returns the protected text unchanged, tokens included. */
class EchoTranslationStep extends PipelineStep {
	async execute(context: TranslationContext, next: () => Promise<void>): Promise<void> {
		context.translatedText = context.protectedText;
		await next();
	}
}

/** Runs the real glossary pre/post steps around an echoing translation step. */
async function translate(
	manager: GlossaryManager,
	text: string,
	targetLang: string
): Promise<TranslationContext> {
	const pipeline = new Pipeline()
		.use(new GlossaryPreStep(manager))
		.use(new EchoTranslationStep())
		.use(new GlossaryPostStep(manager));
	return pipeline.execute(createTranslationContext("key", text, "en", targetLang, options));
}

const restrictedConfig: GlossaryConfig = {
	preserveFormatting: false,
	glossary: {
		API: "API",
		Dashboard: { translation: "Kontrol Paneli", languages: ["tr", "PT-br"] },
	},
};

describe("GlossaryManager languages restriction", () => {
	it("applies a restricted entry when the target language is listed", async () => {
		const context = await translate(
			new GlossaryManager(restrictedConfig),
			"Open the Dashboard",
			"tr"
		);

		expect(context.protectedText).not.toContain("Dashboard");
		expect(context.translatedText).toBe("Open the Kontrol Paneli");
	});

	it("does not protect or replace a restricted entry for an unlisted target language", async () => {
		const context = await translate(
			new GlossaryManager(restrictedConfig),
			"Open the Dashboard API",
			"de"
		);

		// Only the unrestricted entry is protected; "Dashboard" reaches the AI as-is.
		expect([...(context.termMap?.values() ?? [])].map((t) => t.term)).toEqual(["API"]);
		expect(context.protectedText).toContain("Dashboard");
		expect(context.translatedText).toBe("Open the Dashboard API");
	});

	it("compares language codes case-insensitively but as whole tags", () => {
		const manager = new GlossaryManager(restrictedConfig);
		const terms = (lang: string) =>
			manager.getApplicableEntries("en", lang).map((entry) => entry.term);

		expect(terms("pt-BR")).toContain("Dashboard");
		expect(terms("TR")).toContain("Dashboard");
		expect(terms("pt")).not.toContain("Dashboard");
		expect(terms("tr-CY")).not.toContain("Dashboard");
	});

	it("applies entries without a languages list, or with an empty one, to every language", () => {
		const manager = new GlossaryManager({
			glossary: {
				SDK: { translation: "SDK", caseSensitive: true },
				CLI: { translation: "CLI", languages: [] },
			},
		});

		for (const lang of ["de", "ja", "zh-Hant"]) {
			expect(manager.getApplicableEntries("en", lang).map((e) => e.term)).toEqual([
				"SDK",
				"CLI",
			]);
		}
	});
});

describe("GlossaryManager null entries", () => {
	let tempDir: string | undefined;

	afterEach(async () => {
		vi.restoreAllMocks();
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
	});

	it("skips a null entry, warns once, and keeps applying the other terms", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		tempDir = await mkdtemp(path.join(os.tmpdir(), "locai-glossary-"));
		const file = path.join(tempDir, "glossary.json");
		await writeFile(file, JSON.stringify({ API: "API", Broken: null }), "utf8");

		const manager = await GlossaryManager.loadFromFile(file);
		const context = await translate(manager, "Call the API", "fr");

		expect(context.translatedText).toBe("Call the API");
		expect(context.termMap?.size).toBe(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain('"Broken"');

		expect(manager.getStats().terms).toEqual(["API"]);
		expect(manager.validate()).toEqual({ valid: true, errors: [], warnings: [] });
	});
});
