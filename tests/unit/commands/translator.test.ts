import { describe, it, expect, vi, beforeEach } from "vitest";
import * as translator from "../../../src/commands/translator.js";
import translationService from "../../../src/services/translation-service.js";
import { TranslationOptions } from "../../../src/types/index.js";

vi.mock("../../../src/services/translation-service.js", () => ({
	default: {
		translateFile: vi.fn(),
		findLocaleFiles: vi.fn(),
		validateAndFixExistingTranslations: vi.fn(),
	},
}));

describe("Translator Command", () => {
	const options: TranslationOptions = {
		source: "en",
		context: {
			categories: {},
			detection: { threshold: 2, minConfidence: 0.6 },
			fallback: { category: "general", prompt: "Provide a natural translation" },
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should delegate translateFile to service", async () => {
		const file = "test.json";

		await translator.translateFile(file, options);

		expect(translationService.translateFile).toHaveBeenCalledWith(file, options);
	});

	it("should delegate findLocaleFiles to service", async () => {
		const dir = "locales";
		const lang = "en";

		await translator.findLocaleFiles(dir, lang);

		expect(translationService.findLocaleFiles).toHaveBeenCalledWith(dir, lang);
	});

	it("should delegate validateAndFixExistingTranslations to service", async () => {
		const file = "test.json";

		await translator.validateAndFixExistingTranslations(file, options);

		expect(translationService.validateAndFixExistingTranslations).toHaveBeenCalledWith(
			file,
			options
		);
	});
});
