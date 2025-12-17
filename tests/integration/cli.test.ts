import { describe, it, expect, vi, afterEach } from "vitest";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

describe("CLI Integration", () => {
	it("should display help message", async () => {
		// Run the compiled CLI command
		// Note: This assumes the project is built or we use tsx to run source
		// Since we are in dev, let's try running via tsx
		const { stdout } = await execAsync("npx tsx src/cli.ts --help");

		expect(stdout).toContain("Usage: locai [options] [command]");
		expect(stdout).toContain("AI-powered localization tool");
	}, 10000); // Increase timeout for CLI execution
});
