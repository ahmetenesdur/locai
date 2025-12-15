import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import util from "util";

const execAsync = util.promisify(exec);
const TEST_CONFIG_FILE = "localize.config.test.ts";
const ORIGINAL_CONFIG_FILE = "localize.config.ts";
const BAK_CONFIG_FILE = "localize.config.ts.bak";

describe("Config Loading Integration", () => {
	// Backup existing config
	beforeAll(async () => {
		try {
			await fs.access(ORIGINAL_CONFIG_FILE);
			await fs.rename(ORIGINAL_CONFIG_FILE, BAK_CONFIG_FILE);
		} catch {
			// No existing config, ignore
		}
	});

	afterAll(async () => {
		// Restore original config
		try {
			await fs.access(BAK_CONFIG_FILE);
			await fs.rename(BAK_CONFIG_FILE, ORIGINAL_CONFIG_FILE);
		} catch {
			// No backup to restore
		}
	});

	afterEach(async () => {
		try {
			await fs.unlink(TEST_CONFIG_FILE);
		} catch {
			// Ignore
		}
	});

	it("should load a valid TypeScript config file", async () => {
		const configContent = `
            import { defineConfig } from "./src/config/index.js";
            export default defineConfig({
                source: "en",
                targets: ["fr"],
                debug: true
            });
        `;
		await fs.writeFile(TEST_CONFIG_FILE, configContent, "utf-8");

		// We use --config to specify file if supported, but c12 auto-loads.
		// We'll rename our test file to the standard name temporarily for this test if needed,
		// but c12 loads 'localize.config'.
		// Let's create 'localize.config.ts' (which we backed up) with our test content.

		await fs.writeFile("localize.config.ts", configContent, "utf-8");

		const { stdout } = await execAsync("npx tsx src/cli.ts validate-config");

		expect(stdout).toContain("Configuration is valid!");
		expect(stdout).toContain("Source: en");
		expect(stdout).toContain("Targets: 1 languages (fr)");

		// Clean up immediately for this specific step to avoid affecting others if they ran in parallel (vitest runs in parallel)
		// But here we are in a single describe block.
		await fs.unlink("localize.config.ts");
	}, 15000);
});
