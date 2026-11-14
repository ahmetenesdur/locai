import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as Axios from "axios";
import { translateFile } from "../../src/commands/translator.js";
import RetryHelper from "../../src/utils/retry-helper.js";
import type { TranslationOptions } from "../../src/types/index.js";

// Every axios client the providers create talks to the local server below instead of the
// real API, so the real provider code makes real HTTP requests.
const target = vi.hoisted(() => ({ baseURL: "" }));
vi.mock("axios", async (importOriginal) => {
	const actual = await importOriginal<typeof Axios>();
	return {
		...actual,
		default: {
			...actual.default,
			create: (config: Parameters<typeof actual.default.create>[0]) =>
				actual.default.create({ ...config, baseURL: target.baseURL }),
		},
	};
});

/** What the stand-in OpenAI API answers per source text; a missing entry answers HTTP 500. */
let replies: Record<string, string> = {};

const providerKeys = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GEMINI_API_KEY",
	"DEEPSEEK_API_KEY",
	"XAI_API_KEY",
	"DASHSCOPE_API_KEY",
];

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

describe("a run in which translations fail", () => {
	const originalCwd = process.cwd();
	let server: http.Server;
	let projectDir: string;
	let localesDir: string;
	let logged: string[];

	const options = (): TranslationOptions => ({
		source: "en",
		targets: ["tr"],
		localesDir,
		apiProvider: "openai",
		deepContext: false,
		context: {
			categories: {},
			detection: { threshold: 2, minConfidence: 0.6 },
			fallback: { category: "general", prompt: "Provide a natural translation" },
		},
	});

	const writeSource = (content: Record<string, string>) =>
		fs.writeFileSync(path.join(localesDir, "en.json"), JSON.stringify(content));

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => {
				const { messages } = JSON.parse(body) as { messages: { content: string }[] };
				const reply = replies[messages[messages.length - 1].content];
				if (reply === undefined) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: { message: "upstream exploded" } }));
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						choices: [{ message: { role: "assistant", content: reply } }],
					})
				);
			});
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		target.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	beforeEach(() => {
		for (const key of providerKeys) {
			vi.stubEnv(key, key === "OPENAI_API_KEY" ? "test-key" : "");
		}
		vi.stubEnv("DEBUG", "");
		vi.spyOn(RetryHelper, "delay").mockResolvedValue();
		logged = [];
		const record = (...args: unknown[]) => {
			logged.push(
				args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(" ")
			);
		};
		vi.spyOn(console, "log").mockImplementation(record);
		vi.spyOn(console, "warn").mockImplementation(record);
		vi.spyOn(console, "error").mockImplementation(record);
		vi.spyOn(console, "clear").mockImplementation(() => {});

		// The run writes .localize-cache/ into the working directory: use a temp project.
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-fail-")));
		localesDir = path.join(projectDir, "locales");
		fs.mkdirSync(localesDir);
		process.chdir(projectDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		server.close();
		await once(server, "close");
	});

	it("counts every failed key in the summary and the per-language stats", async () => {
		writeSource({ hello: "Hello", bye: "Goodbye" });
		replies = {};

		const stats = await translateFile(path.join(localesDir, "en.json"), options());

		expect(stats.failed).toBe(2);
		expect(stats.success).toBe(0);
		expect(stats.languages.tr).toMatchObject({ added: 0, failed: 2 });
		expect(fs.existsSync(path.join(localesDir, "tr.json"))).toBe(false);
		const output = logged.join("\n");
		expect(output).toMatch(/Failed: 2/);
		expect(output).toMatch(/tr\s+\|\s+0 added \|\s+0 skipped \|\s+2 failed/);
		expect(output).toContain("Finished with errors");
		expect(output).not.toContain("completed successfully");
	});

	it("prints the error message of a failed key and its stack only with --debug", async () => {
		writeSource({ hello: "Hello" });
		replies = {};

		await translateFile(path.join(localesDir, "en.json"), options());
		const output = logged.join("\n");
		expect(output).toMatch(/Translation error - key "hello": .*All providers failed/);
		expect(output).not.toMatch(/^\s+at /m);
		expect(output).not.toContain("task failed");

		// --debug sets DEBUG=true
		logged = [];
		fs.rmSync(path.join(projectDir, ".localize-cache"), { recursive: true, force: true });
		vi.stubEnv("DEBUG", "true");
		await translateFile(path.join(localesDir, "en.json"), options());
		expect(logged.join("\n")).toMatch(/^\s+at /m);
	});

	it("counts a partial failure and writes only the successful keys", async () => {
		writeSource({ hello: "Hello", bye: "Goodbye" });
		replies = { Hello: "Merhaba" };

		const stats = await translateFile(path.join(localesDir, "en.json"), options());

		expect(stats).toMatchObject({ success: 1, failed: 1 });
		expect(stats.languages.tr).toMatchObject({ added: 1, failed: 1 });
		expect(readJson(path.join(localesDir, "tr.json"))).toEqual({ hello: "Merhaba" });
	});

	it("translates a changed key again on the next run when its translation failed", async () => {
		const source = path.join(localesDir, "en.json");
		writeSource({ hello: "Hello", bye: "Goodbye" });
		replies = { Hello: "Merhaba", Goodbye: "Hoşça kal" };
		await translateFile(source, options());
		expect(readJson(path.join(localesDir, "tr.json"))).toEqual({
			hello: "Merhaba",
			bye: "Hoşça kal",
		});

		// The source text of `hello` changes, and its translation fails this time
		writeSource({ hello: "Hello there", bye: "Goodbye" });
		replies = {};
		const failed = await translateFile(source, options());
		expect(failed.failed).toBe(1);
		expect(readJson(path.join(localesDir, "tr.json")).hello).toBe("Merhaba");

		// The next run must still treat `hello` as changed and translate it
		replies = { "Hello there": "Merhaba oradaki" };
		const retried = await translateFile(source, options());
		expect(retried).toMatchObject({ success: 1, failed: 0 });
		expect(readJson(path.join(localesDir, "tr.json"))).toEqual({
			hello: "Merhaba oradaki",
			bye: "Hoşça kal",
		});
	});

	it("translates a new key on the next run when its translation failed", async () => {
		const source = path.join(localesDir, "en.json");
		writeSource({ hello: "Hello" });
		replies = {};
		await translateFile(source, options());

		replies = { Hello: "Merhaba" };
		const retried = await translateFile(source, options());
		expect(retried).toMatchObject({ success: 1, failed: 0 });
		expect(readJson(path.join(localesDir, "tr.json"))).toEqual({ hello: "Merhaba" });
	});
});
