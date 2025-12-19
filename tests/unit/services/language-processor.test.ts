import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import { LanguageProcessor } from "../../../src/services/language-processor.js";
import { FileManager } from "../../../src/utils/file-manager.js";
import ObjectTransformer from "../../../src/utils/object-transformer.js";
import Orchestrator from "../../../src/core/orchestrator.js";
import InputValidator from "../../../src/utils/input-validator.js";
import uiManager from "../../../src/utils/ui-manager.js";
import statisticsManager from "../../../src/utils/statistics-manager.js";
import { TranslationOptions } from "../../../src/types/index.js";

// Mock dependencies
vi.mock("../../../src/utils/file-manager.js");
vi.mock("../../../src/utils/object-transformer.js");
vi.mock("../../../src/core/orchestrator.js");
vi.mock("../../../src/utils/input-validator.js");
vi.mock("../../../src/utils/ui-manager.js");
vi.mock("../../../src/utils/statistics-manager.js");

describe("LanguageProcessor", () => {
	const mockOptions: TranslationOptions = {
		source: "en",
		targets: ["tr"],
		localesDir: "./locales",
		debug: false,
		context: { enabled: false },
	};

	const mockGlobalStats = {
		total: 0,
		success: 0,
		failed: 0,
		skipped: 0,
		languages: {
			tr: { processed: 0, failed: 0, skipped: 0, added: 0, timeMs: 0 },
		},
		byCategory: {},
		details: {},
		orchestrators: [],
		totalTime: 0,
		startTime: new Date().toISOString(),
	};

	const mockOrchestrator = new Orchestrator(mockOptions as any);

	beforeEach(() => {
		vi.resetAllMocks();
		// Setup default mock implementations
		vi.mocked(InputValidator.validateLanguageCode).mockReturnValue("tr");
		vi.mocked(InputValidator.createSafeFilePath).mockReturnValue("/mock/locales/tr.json");
		vi.mocked(FileManager.readJSON).mockResolvedValue({});
		vi.mocked(ObjectTransformer.flatten).mockReturnValue({});
		vi.mocked(uiManager.log).mockResolvedValue();
		vi.mocked(statisticsManager.initLanguageStats).mockReturnValue();
	});

	it("should process language successfully", async () => {
		const result = await LanguageProcessor.processLanguage(
			"tr",
			"/mock/locales/en.json",
			{ greeting: "Hello" },
			mockOrchestrator,
			mockOptions,
			mockGlobalStats,
			{ newKeys: ["greeting"], modifiedKeys: [] }
		);

		expect(result).toBeDefined();
		expect(statisticsManager.initLanguageStats).toHaveBeenCalledWith("tr");
		expect(FileManager.readJSON).toHaveBeenCalled();
	});

	it("should handle invalid inputs", async () => {
		await expect(
			LanguageProcessor.processLanguage(
				"", // Invalid target lang
				"/mock/locales/en.json",
				{},
				mockOrchestrator,
				mockOptions,
				mockGlobalStats,
				{}
			)
		).rejects.toThrow("Invalid target language provided");
	});

	it("should identify placeholder-only text", () => {
		expect(LanguageProcessor.isPlaceholderOnlyText("{name}")).toBe(true);
		expect(LanguageProcessor.isPlaceholderOnlyText("Hello {name}")).toBe(false);
		expect(LanguageProcessor.isPlaceholderOnlyText("%s")).toBe(true);
		expect(LanguageProcessor.isPlaceholderOnlyText("  ${value}  ")).toBe(true);
	});
});
