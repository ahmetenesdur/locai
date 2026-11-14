import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import translationService from "../../../src/services/translation-service.js";
import { FileManager } from "../../../src/utils/file-manager.js";
import Orchestrator from "../../../src/core/orchestrator.js";
import { SourceCodeAnalyzer } from "../../../src/services/source-analyzer.js";
import statisticsManager from "../../../src/utils/statistics-manager.js";
import { TranslationOptions } from "../../../src/types/index.js";

// Mock dependencies
vi.mock("../../../src/utils/file-manager.js");
vi.mock("../../../src/core/orchestrator.js");
// Mock InputValidator
vi.mock("../../../src/utils/input-validator.js", () => ({
	default: {
		validateLanguageCode: vi.fn().mockImplementation((l) => l),
		validateLanguageCodes: vi.fn().mockImplementation((l) => l),
		validateDirectoryPath: vi.fn().mockImplementation((p) => p),
		createSafeFilePath: vi.fn().mockImplementation((dir, file) => `${dir}/${file}`),
		validateKey: vi.fn().mockImplementation((k) => k),
		validateText: vi.fn().mockImplementation((t) => t),
	},
}));
vi.mock("../../../src/utils/ui-manager.js", () => ({
	default: {
		log: vi.fn(),
		logBatchResults: vi.fn(),
		displayGlobalSummary: vi.fn(),
	},
}));
// Shared stats object for mocks

vi.mock("../../../src/utils/statistics-manager.js", () => {
	const mockStats = {
		total: 0,
		success: 0,
		failed: 0,
		skipped: 0,
		languages: {} as Record<string, Record<string, number>>,
		details: {},
		byCategory: {},
	};
	return {
		default: {
			reset: vi.fn().mockImplementation(() => {
				mockStats.languages = {};
				// reset other fields if needed
			}),
			getStats: vi.fn().mockReturnValue(mockStats),
			initLanguageStats: vi.fn().mockImplementation((lang: string) => {
				mockStats.languages[lang] = {
					processed: 0,
					success: 0,
					failed: 0,
					skipped: 0,
					added: 0,
					timeMs: 0,
				};
			}),
		},
	};
});
vi.mock("../../../src/utils/state-manager.js", () => ({
	default: class {
		loadState = vi.fn().mockResolvedValue({});
		generateStateFromSource = vi.fn().mockReturnValue({});
		compareStates = vi.fn().mockReturnValue({ newKeys: [], modifiedKeys: [], deletedKeys: [] });
		getComparisonStats = vi.fn().mockReturnValue({ hasChanges: false });
		saveState = vi.fn().mockResolvedValue(undefined);
	},
}));
vi.mock("../../../src/utils/graceful-shutdown.js", () => ({
	default: {
		registerCallback: vi.fn(),
	},
}));

describe("TranslationService", () => {
	// service is just the imported singleton
	const service = translationService;
	const baseOptions: TranslationOptions = {
		source: "en",
		context: {
			categories: {},
			detection: { threshold: 2, minConfidence: 0.6 },
			fallback: { category: "general", prompt: "Provide a natural translation" },
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// translateFile stops early when no provider has an API key
		vi.stubEnv("OPENAI_API_KEY", "test-key");
		// Setup FileManager mocks
		vi.mocked(FileManager.readJSON).mockResolvedValue({});
		vi.mocked(FileManager.writeJSON).mockResolvedValue(true);
		vi.mocked(FileManager.exists).mockResolvedValue(true);
		// process.cwd mock might be needed if validation checks path, but usually it works if we pass absolute paths or relative that resolve inside
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	it("should validate inputs correctly", async () => {
		await expect(service.validateTranslationInputs("", baseOptions)).rejects.toThrow(
			"File path must be a non-empty string"
		);
	});

	it("should translate file successfully", async () => {
		const mockSourceFile = "/Users/test/project/locales/en.json";
		const mockOptions: TranslationOptions = {
			...baseOptions,
			targets: ["es"],
			debug: false,
		};

		// Mock reading source file
		vi.mocked(FileManager.readJSON).mockImplementation((path: string) => {
			if (path.includes("en.json")) return Promise.resolve({ greeting: "Hello" });
			return Promise.resolve({}); // Target file is empty
		});

		// Mock Orchestrator behavior
		const mockProcessTranslations = vi
			.fn()
			.mockResolvedValue([
				{ key: "greeting", translated: "Hola", success: true, context: {} },
			]);
		// Partial stand-in: only the members TranslationService/LanguageProcessor touch
		vi.mocked(Orchestrator).mockImplementation(function () {
			return {
				processTranslations: mockProcessTranslations,
				progress: { getStatus: vi.fn() },
				confidenceSettings: { reviewQueue: [] },
				saveReviewQueue: vi.fn(),
			} as unknown as Orchestrator;
		});

		// Mock process.cwd to ensure validation passes
		vi.spyOn(process, "cwd").mockReturnValue("/Users/test/project");

		// We need to pass absolute path that starts with cwd
		await service.translateFile(mockSourceFile, mockOptions);

		expect(FileManager.readJSON).toHaveBeenCalledWith(expect.stringContaining("en.json"));
		expect(Orchestrator).toHaveBeenCalled();
		expect(mockProcessTranslations).toHaveBeenCalled();
		expect(FileManager.writeJSON).toHaveBeenCalledWith(
			expect.stringContaining("es.json"),
			expect.objectContaining({ greeting: "Hola" })
		);

		vi.restoreAllMocks(); // restore process.cwd
	});

	describe("source code scan (deep context)", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		/** Runs processAllLanguages without target languages; returns the analyzer's initialize spy. */
		const scanWith = async (options: TranslationOptions) => {
			const initialize = vi
				.spyOn(SourceCodeAnalyzer.prototype, "initialize")
				.mockResolvedValue();
			vi.spyOn(console, "log").mockImplementation(() => {});

			await service.processAllLanguages(
				"/Users/test/project/locales/en.json",
				{},
				{ ...options, targets: [] },
				statisticsManager.getStats(),
				{ newKeys: [], modifiedKeys: [], deletedKeys: [], hasChanges: false }
			);
			return initialize;
		};

		it("scans the source code by default", async () => {
			expect(await scanWith(baseOptions)).toHaveBeenCalledTimes(1);
		});

		it("does not scan the source code when deepContext is false", async () => {
			expect(await scanWith({ ...baseOptions, deepContext: false })).not.toHaveBeenCalled();
		});
	});
});
