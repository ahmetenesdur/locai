import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile, type ExecFileException } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve("src/cli.ts");
const tsxPath = path.resolve("node_modules/.bin/tsx");

const providerKeys = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GEMINI_API_KEY",
	"DEEPSEEK_API_KEY",
	"XAI_API_KEY",
	"DASHSCOPE_API_KEY",
];

interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}

/** Run the real CLI entry in `cwd` with no provider API key in the environment. */
const runCli = (args: string[], cwd: string): Promise<CliRun> => {
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const key of [...providerKeys, "DEBUG", "VERBOSE"]) {
		delete env[key];
	}
	return new Promise((resolve) => {
		execFile(tsxPath, [cliPath, ...args], { cwd, env }, (error, stdout, stderr) => {
			const code = error ? ((error as ExecFileException).code as number) : 0;
			resolve({ code, stdout, stderr });
		});
	});
};

describe("a run with no provider API key", () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-nokey-")));
		fs.mkdirSync(path.join(projectDir, "locales"));
		fs.writeFileSync(
			path.join(projectDir, "locales", "en.json"),
			JSON.stringify({ hello: "Hello", bye: "Goodbye" })
		);
	});

	afterEach(() => {
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	it("`translate` stops with one message naming the API key variables and exits 1", async () => {
		const run = await runCli(["translate", "--source", "en", "--targets", "tr"], projectDir);

		expect(run.code).toBe(1);
		expect(run.stderr).toContain("No AI provider has an API key");
		for (const key of providerKeys) {
			expect(run.stderr).toContain(key);
		}
		expect(run.stdout + run.stderr).not.toContain("Translation error - key");
		expect(run.stdout + run.stderr).not.toMatch(/^\s+at /m);
		expect(run.stdout).not.toContain("completed successfully");
		expect(fs.existsSync(path.join(projectDir, "locales", "tr.json"))).toBe(false);
		expect(fs.existsSync(path.join(projectDir, ".localize-cache"))).toBe(false);
	}, 30000);

	it("`fix` stops before re-translating and exits 1", async () => {
		fs.writeFileSync(
			path.join(projectDir, "locales", "tr.json"),
			JSON.stringify({ hello: "Merhaba ".repeat(30), bye: "Hoşça kal" })
		);

		const run = await runCli(["--source", "en", "--targets", "tr", "fix"], projectDir);

		expect(run.code).toBe(1);
		expect(run.stdout).toContain("length issues in tr");
		expect(run.stderr).toContain("No AI provider has an API key");
		expect(run.stdout + run.stderr).not.toMatch(/^\s+at /m);
	}, 30000);
});
