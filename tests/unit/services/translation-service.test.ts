import { describe, it, expect, vi, beforeEach } from "vitest";
import translationService from "../../../src/services/translation-service.js";
import { FileManager } from "../../../src/utils/file-manager.js";
import Orchestrator from "../../../src/core/orchestrator.js";
import uiManager from "../../../src/utils/ui-manager.js";
import statisticsManager from "../../../src/utils/statistics-manager.js";

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
		validateKey: vi.fn(),
		validateText: vi.fn(),
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
		languages: {} as Record<string, any>,
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
			initLanguageStats: vi.fn().mockImplementation((lang) => {
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

	beforeEach(() => {
		vi.clearAllMocks();
		// service is already instantiated

		// Setup FileManager mocks
		(FileManager.readJSON as any).mockResolvedValue({});
		(FileManager.writeJSON as any).mockResolvedValue(undefined);
		(FileManager.exists as any).mockResolvedValue(true);
		// process.cwd mock might be needed if validation checks path, but usually it works if we pass absolute paths or relative that resolve inside
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	it("should validate inputs correctly", async () => {
		await expect(service.validateTranslationInputs("", {} as any)).rejects.toThrow(
			"File path must be a non-empty string"
		);
	});

	it("should translate file successfully", async () => {
		const mockSourceFile = "/Users/test/project/locales/en.json";
		const mockOptions: any = {
			source: "en",
			targets: ["es"],
			debug: false,
		};

		// Mock reading source file
		(FileManager.readJSON as any).mockImplementation((path: string) => {
			if (path.includes("en.json")) return Promise.resolve({ greeting: "Hello" });
			return Promise.resolve({}); // Target file is empty
		});

		// Mock Orchestrator behavior
		const mockProcessTranslations = vi
			.fn()
			.mockResolvedValue([
				{ key: "greeting", translated: "Hola", success: true, context: {} },
			]);
		(Orchestrator as any).mockImplementation(function () {
			return {
				processTranslations: mockProcessTranslations,
				progress: { getStatus: vi.fn() },
				confidenceSettings: { reviewQueue: [] },
				saveReviewQueue: vi.fn(),
			};
		});

		// Mock process.cwd to ensure validation passes
		const originalCwd = process.cwd;
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
});
