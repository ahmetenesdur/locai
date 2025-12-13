import { describe, it, expect, vi, beforeEach } from "vitest";
import Orchestrator from "../../../src/core/orchestrator.js";
import ProviderFactory from "../../../src/core/provider-factory.js";
import ContextProcessor from "../../../src/core/context-processor.js";

// Mock ProviderFactory
vi.mock("../../../src/core/provider-factory.js", () => ({
	default: {
		getProvider: vi.fn(),
	},
}));

// Mock Logger
vi.mock("../../../src/utils/logger.js", () => ({
	getLogger: vi.fn().mockReturnValue({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}),
	default: class {},
	log: vi.fn(),
}));

// Mock ContextProcessor
vi.mock("../../../src/core/context-processor.js", () => ({
	default: class {
		analyze = vi.fn().mockResolvedValue({});
		analyzeBatch = vi.fn().mockResolvedValue([{}]);
	},
}));

describe("Orchestrator", () => {
	let orchestrator: Orchestrator;
	const mockOptions: any = {
		advanced: {
			rateLimiting: { enabled: false },
			caching: { enabled: false },
		},
		apiProvider: "mock",
		targets: ["es"],
		context: {},
		source: "en",
		qualityChecks: {
			enabled: false,
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		// Setup mock provider
		(ProviderFactory.getProvider as any).mockReturnValue({
			translate: vi.fn().mockResolvedValue("Translated Text"),
		});

		orchestrator = new Orchestrator(mockOptions);
	});

	it("should initialize pipeline correctly", () => {
		expect(orchestrator).toBeDefined();
	});

	it("should process translation successfully", async () => {
		const result = await orchestrator.processTranslation("key1", "Hello", "es", {}, null);

		expect(result.translated).toBe("Translated Text");
		// expect(result.confidence).toBeDefined(); // Only defined if confidence scoring enabled
		expect(result.success).toBe(true);
	});

	it("should handle translation errors", async () => {
		// Force provider error
		(ProviderFactory.getProvider as any).mockReturnValue({
			translate: vi.fn().mockRejectedValue(new Error("Provider Error")),
		});

		const result = await orchestrator.processTranslation("key2", "Fail", "es", {}, null);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Provider Error");
		// Logic might fallback to source text
		expect(result.translated).toBe("Fail");
	});

	it("should process batch translations", async () => {
		const items = [
			{ key: "key1", text: "Hello", targetLang: "es" },
			{ key: "key2", text: "World", targetLang: "es" },
		];

		const results = await orchestrator.processTranslations(items);

		expect(results).toHaveLength(2);
		expect(results[0].translated).toBe("Translated Text");
		expect(results[1].translated).toBe("Translated Text");
	});
});
