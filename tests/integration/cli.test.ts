import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import packageJson from "../../package.json" with { type: "json" };

const execAsync = util.promisify(exec);
const cliPath = path.resolve("src/cli.ts");

describe("CLI Integration", () => {
	it("should display help message", async () => {
		// Run the compiled CLI command
		// Note: This assumes the project is built or we use tsx to run source
		// Since we are in dev, let's try running via tsx
		const { stdout } = await execAsync("npx tsx src/cli.ts --help");

		expect(stdout).toContain("Usage: locai [options] [command]");
		expect(stdout).toContain("AI-powered localization tool");
	}, 10000); // Increase timeout for CLI execution

	it("prints the package version for -V even when the config sets `version`", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "locai-cli-"));
		try {
			fs.writeFileSync(
				path.join(dir, "localize.config.json"),
				JSON.stringify({ version: "0.0.1" })
			);
			const { stdout } = await execAsync(`npx tsx "${cliPath}" -V`, { cwd: dir });
			expect(stdout.trim().split("\n").pop()).toBe(packageJson.version);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 20000);
});
