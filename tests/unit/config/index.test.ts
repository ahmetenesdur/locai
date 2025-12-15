import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineConfig, loadConfig } from "../../../src/config/index.js";
import * as c12 from "c12";

// Mock c12 module
vi.mock("c12", () => ({
	loadConfig: vi.fn(),
}));

describe("Config Module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("defineConfig", () => {
		it("should return the configuration object as is", () => {
			const config = {
				source: "en",
				targets: ["tr", "es"],
				apiProvider: "openai",
			};

			const result = defineConfig(config);
			expect(result).toBe(config);
			// Verify type preservation (compile-time check mainly, but runtime identity holds)
			expect(result).toEqual(config);
		});
	});

	describe("loadConfig", () => {
		it("should call c12 loadConfig with correct parameters", async () => {
			const mockC12Response = {
				config: { source: "fr" },
				configFile: "localize.config.ts",
				layers: [],
			};

			// @ts-ignore
			c12.loadConfig.mockResolvedValue(mockC12Response);

			const result = await loadConfig("/test/cwd");

			expect(c12.loadConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "localize",
					configFile: "localize.config",
					rcFile: ".localizerc",
					dotenv: true,
					cwd: "/test/cwd",
					defaults: expect.objectContaining({
						source: "en",
						targets: [],
						localesDir: "./locales",
					}),
				})
			);

			expect(result).toEqual(mockC12Response);
		});

		it("should handle missing config gracefully if c12 returns null config", async () => {
			const mockC12Response = {
				config: null,
				configFile: undefined,
				layers: [],
			};

			// @ts-ignore
			c12.loadConfig.mockResolvedValue(mockC12Response);

			const result = await loadConfig();

			expect(result.config).toEqual({});
		});
	});
});
