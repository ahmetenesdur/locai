import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { runCommand } from "../../../src/cli/helpers.js";
import type { ResolvedLocalizeConfig } from "../../../src/config/index.js";
import {
	findLocaleFiles,
	translateFile,
	validateAndFixExistingTranslations,
} from "../../../src/commands/translator.js";

vi.mock("../../../src/commands/translator.js");
vi.mock("../../../src/config/setup.js");
vi.mock("../../../src/utils/input-validator.js");

const config: ResolvedLocalizeConfig = {
	source: "en",
	targets: ["tr"],
	localesDir: "./locales",
	concurrencyLimit: 5,
	cacheEnabled: true,
	retryOptions: { maxRetries: 2, initialDelay: 1000, maxDelay: 10000 },
	context: {
		enabled: true,
		detection: { threshold: 2, minConfidence: 0.6 },
		useAI: false,
		minTextLength: 50,
		categories: {},
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
	apiConfig: {},
	fileOperations: { format: "json", fileStructure: "flat" },
};

describe("runCommand", () => {
	let exit: MockInstance<typeof process.exit>;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(findLocaleFiles).mockResolvedValue(["locales/en.json"]);
		exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("runs `fix` with its default --length flag", async () => {
		// commander passes `length: true` for `locai fix`
		await runCommand(config, { length: true }, "fix");

		expect(exit).not.toHaveBeenCalledWith(1);
		expect(validateAndFixExistingTranslations).toHaveBeenCalledWith(
			"locales/en.json",
			expect.objectContaining({ fixLength: true })
		);
	});

	it("disables the cache for `translate --no-cache`", async () => {
		// commander turns `--no-cache` into `cache: false`
		await runCommand(config, { cache: false }, "translate");

		expect(translateFile).toHaveBeenCalledWith(
			"locales/en.json",
			expect.objectContaining({ cacheEnabled: false })
		);
	});

	it("keeps the configured cache setting when --no-cache is not passed", async () => {
		await runCommand(config, { cache: true }, "translate");

		expect(translateFile).toHaveBeenCalledWith(
			"locales/en.json",
			expect.objectContaining({ cacheEnabled: true })
		);
	});
});
