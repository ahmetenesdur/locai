import { describe, it, expect, vi, beforeEach } from "vitest";
import * as translator from "../../../src/commands/translator.js";
import translationService from "../../../src/services/translation-service.js";

vi.mock("../../../src/services/translation-service.js", () => ({
	default: {
		translateFile: vi.fn(),
		findLocaleFiles: vi.fn(),
		validateAndFixExistingTranslations: vi.fn(),
	},
}));

describe("Translator Command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should delegate translateFile to service", async () => {
		const file = "test.json";
		const options: any = { source: "en" };

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
		const options: any = { source: "en" };

		await translator.validateAndFixExistingTranslations(file, options);

		expect(translationService.validateAndFixExistingTranslations).toHaveBeenCalledWith(
			file,
			options
		);
	});
});
