import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { program } from "commander";
import { resolveReviewConfig, runCommand, type CommandOptions } from "../../../src/cli/helpers.js";
import type { ReviewCommandConfig } from "../../../src/commands/review.js";
import InputValidator from "../../../src/utils/input-validator.js";
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

/** The config the CLI actions below hand to runCommand; set by `runCli`. */
let cliConfig: ResolvedLocalizeConfig = config;

// runCommand reads the global options from commander's shared `program`, so declare on it the
// flags (with the same defaults) that src/cli.ts declares, and parse real argv.
program
	.option("-s, --source <lang>", "Source language", config.source)
	.option(
		"-t, --targets <langs>",
		"Target languages (comma separated)",
		(val: string) => val.split(","),
		config.targets
	)
	.option("--localesDir <dir>", "Localization files directory", config.localesDir)
	.option("--no-deep-context", "Disable deep context analysis")
	.option("--debug", "Enable debug mode", false)
	.option("--verbose", "Enable detailed diagnostic output", false)
	.exitOverride();

program
	.command("translate")
	.option("--provider <provider>", "Translation provider", config.apiProvider)
	.option("--concurrency <number>", "Concurrent translations", Number, config.concurrencyLimit)
	.option("--no-cache", "Disable translation caching")
	.option("--force", "Force update of existing translations", false)
	.option("--length <mode>", "Length control mode", "smart")
	.option("--auto-optimize", "Auto-optimize", false)
	.option("--stats", "Stats", false)
	.option("--min-confidence <score>", "Minimum confidence threshold (0-1)", parseFloat)
	.option("--save-review-queue", "Save low-confidence items for review", false)
	.action((options: CommandOptions) => runCommand(cliConfig, options, "translate"));

program
	.command("fix")
	.option("--length", "Fix length issues", true)
	.action((options: CommandOptions) => runCommand(cliConfig, options, "fix"));

/** The settings the `review` action resolved; set when `review` runs. */
let reviewConfig: ReviewCommandConfig | undefined;
program.command("review").action(() => {
	reviewConfig = resolveReviewConfig(cliConfig);
});

program.action(() => runCommand(cliConfig, {}, "translate"));

// Snapshot the defaults so each test starts from an unparsed program.
program.saveStateBeforeParse();

const runCli = async (args: string[], cfg: ResolvedLocalizeConfig = config) => {
	cliConfig = cfg;
	await program.parseAsync(["node", "locai", ...args]);
};

describe("runCommand", () => {
	let exit: MockInstance<typeof process.exit>;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(findLocaleFiles).mockResolvedValue(["locales/en.json"]);
		exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		program.restoreStateBeforeParse();
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

	it("keeps a config-file `context.enabled: false`", async () => {
		await runCommand(
			{ ...config, context: { ...config.context, enabled: false } },
			{},
			"translate"
		);

		expect(translateFile).toHaveBeenCalledWith(
			"locales/en.json",
			expect.objectContaining({ context: expect.objectContaining({ enabled: false }) })
		);
	});

	it("enables context detection when the config leaves `context.enabled` unset", async () => {
		await runCommand(
			{ ...config, context: { ...config.context, enabled: undefined } },
			{},
			"translate"
		);

		expect(translateFile).toHaveBeenCalledWith(
			"locales/en.json",
			expect.objectContaining({ context: expect.objectContaining({ enabled: true }) })
		);
	});

	describe("CLI flags", () => {
		it("passes the global --debug flag into the config", async () => {
			await runCli(["translate", "--debug"]);

			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({
					debug: true,
					advanced: expect.objectContaining({ debug: true }),
				})
			);
		});

		it("passes the global --verbose flag into the config", async () => {
			await runCli(["translate", "--verbose"]);

			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({
					verbose: true,
					logging: expect.objectContaining({ verbose: true }),
				})
			);
		});

		it("disables deep context for --no-deep-context", async () => {
			await runCli(["translate", "--no-deep-context"]);

			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({ deepContext: false })
			);
		});

		it("passes --min-confidence and --save-review-queue into the config", async () => {
			await runCli(["translate", "--min-confidence", "0.8", "--save-review-queue"]);

			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({ minConfidence: 0.8, saveReviewQueue: true })
			);
		});

		it("warns about and ignores a --min-confidence outside 0-1", async () => {
			await runCli(["translate", "--min-confidence", "2"], { ...config, minConfidence: 0.7 });

			expect(exit).not.toHaveBeenCalledWith(1);
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("ignoring --min-confidence 2")
			);
			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({ minConfidence: 0.7 })
			);
		});

		it("applies global flags to `fix` and to the default command", async () => {
			await runCli(["fix", "--debug", "--no-deep-context"]);
			expect(validateAndFixExistingTranslations).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({ debug: true, deepContext: false })
			);

			await runCli(["--verbose"]);
			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({ verbose: true })
			);
		});

		it("keeps the config-file values when the flags are omitted", async () => {
			await runCli(["translate"], {
				...config,
				debug: true,
				forceUpdate: true,
				deepContext: false,
				minConfidence: 0.7,
				saveReviewQueue: true,
				advanced: { debug: true },
				logging: { verbose: true },
			});

			expect(translateFile).toHaveBeenCalledWith(
				"locales/en.json",
				expect.objectContaining({
					debug: true,
					verbose: true,
					forceUpdate: true,
					deepContext: false,
					minConfidence: 0.7,
					saveReviewQueue: true,
					advanced: expect.objectContaining({ debug: true }),
					logging: expect.objectContaining({ verbose: true }),
				})
			);
		});
	});

	it("passes the global --source and --localesDir flags to `review`", async () => {
		reviewConfig = undefined;
		vi.mocked(InputValidator.validateLanguageCode).mockImplementation((code) => String(code));
		vi.mocked(InputValidator.validateDirectoryPath).mockImplementation((dir) => String(dir));

		await runCli(["--source", "de", "--localesDir", "./i18n", "review"], {
			...config,
			source: "fr",
			localesDir: "./messages",
		});

		expect(reviewConfig).toEqual({ source: "de", localesDir: "./i18n" });
	});
});
