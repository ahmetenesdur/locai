import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import packageJson from "../../package.json" with { type: "json" };

const execAsync = util.promisify(exec);
const cliPath = path.resolve("src/cli.ts");
// The project's own tsx: `npx tsx` from a directory outside the repo would try to download it.
const tsxPath = path.resolve("node_modules/.bin/tsx");

describe("CLI Integration", () => {
	it("should display help message", async () => {
		const { stdout } = await execAsync(`"${tsxPath}" "${cliPath}" --help`);

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
			const { stdout } = await execAsync(`"${tsxPath}" "${cliPath}" -V`, { cwd: dir });
			expect(stdout.trim().split("\n").pop()).toBe(packageJson.version);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 20000);
});
