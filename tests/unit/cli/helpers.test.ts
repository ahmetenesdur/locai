import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoDetectConfig, runCommand } from "../../../src/cli/helpers.js";
import { FrameworkDetector } from "../../../src/core/detection/framework-detector.js";
import InputValidator from "../../../src/utils/input-validator.js";

vi.mock("../../../src/core/detection/framework-detector.js");
vi.mock("../../../src/utils/input-validator.js");
// Mock translation service or other deps if needed for runCommand
// For runCommand, we might need more substantial mocking, focusing on autoDetect for now or mocking the entire command flow.
// runCommand is tricky because it imports many things. Let's focus on autoDetectConfig first.

describe("autoDetectConfig", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("should detect locales directory if not set", async () => {
		vi.mocked(FrameworkDetector.detect).mockResolvedValue({
			localesDir: "./detected/locales",
			fileFormat: "json",
			framework: "next",
		});

		const config = await autoDetectConfig({ source: "en" });
		expect(config.localesDir).toBe("./detected/locales");
	});

	it("should not override existing localesDir", async () => {
		vi.mocked(FrameworkDetector.detect).mockResolvedValue({
			localesDir: "./detected/locales",
			fileFormat: "json",
			framework: "next",
		});

		const config = await autoDetectConfig({ source: "en", localesDir: "./custom" });
		expect(config.localesDir).toBe("./custom");
	});
});
