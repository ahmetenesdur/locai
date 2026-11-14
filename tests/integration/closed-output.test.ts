import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const cliPath = path.resolve("src/cli.ts");
// Load tsx as an import hook so the CLI runs in the spawned process itself, not in a grandchild.
const tsxLoader = pathToFileURL(path.resolve("node_modules/tsx/dist/loader.mjs")).href;

const providerKeys = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GEMINI_API_KEY",
	"DEEPSEEK_API_KEY",
	"XAI_API_KEY",
	"DASHSCOPE_API_KEY",
];

describe("a run whose output nobody reads anymore", () => {
	let projectDir: string;
	let child: ChildProcess | undefined;

	beforeEach(() => {
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-closed-")));
		fs.mkdirSync(path.join(projectDir, "locales"));
		fs.writeFileSync(
			path.join(projectDir, "locales", "en.json"),
			JSON.stringify({ hello: "Hello", bye: "Goodbye" })
		);
	});

	afterEach(() => {
		// Never leave the CLI behind: before the fix it kept a CPU core busy until it was killed.
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
		child = undefined;
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	// If the CLI never exits, this test fails on its timeout and afterEach kills the process.
	it("exits when the reader of stdout and stderr goes away", async () => {
		const env: NodeJS.ProcessEnv = { ...process.env };
		for (const key of [...providerKeys, "DEBUG", "VERBOSE"]) {
			delete env[key];
		}

		child = spawn(
			process.execPath,
			["--import", tsxLoader, cliPath, "translate", "--source", "en", "--targets", "tr"],
			{ cwd: projectDir, env, stdio: ["ignore", "pipe", "pipe"] }
		);
		// The parent stops reading, as a wrapper that timed out or was killed would.
		child.stdout?.destroy();
		child.stderr?.destroy();

		const [code, signal] = await once(child, "exit");

		// The run was cut short, so it must not look successful.
		expect({ code, signal }).toEqual({ code: 1, signal: null });
	}, 20000);
});
