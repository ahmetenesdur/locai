import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as Axios from "axios";
import prompts from "prompts";
import { translateFile } from "../../src/commands/translator.js";
import ReviewCommand from "../../src/commands/review.js";
import Orchestrator from "../../src/core/orchestrator.js";
import type { TranslationResult } from "../../src/core/pipeline/context.js";
import RetryHelper from "../../src/utils/retry-helper.js";
import type { ReviewQueueFile } from "../../src/utils/review-queue.js";
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
// `locai review` reads the reviewer's decisions from the terminal.
vi.mock("prompts");

/** What the stand-in OpenAI API answers for each source text. */
const replies: Record<string, string> = {
	// A good translation
	"Welcome back, {name}!": "¡Bienvenido de nuevo, {name}!",
	// Drops the {count} placeholder
	"You have {count} new messages.": "Tienes mensajes nuevos.",
	// Drops the <b> tags and the {file} placeholder
	"Delete <b>{file}</b>?": "¿Eliminar?",
};

const providerKeys = [
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GEMINI_API_KEY",
	"DEEPSEEK_API_KEY",
	"XAI_API_KEY",
	"DASHSCOPE_API_KEY",
];

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Translate options for the temp project: OpenAI to Spanish, no source-code scanning. */
const translateOptions = (localesDir: string): TranslationOptions => ({
	source: "en",
	targets: ["es"],
	localesDir,
	apiProvider: "openai",
	deepContext: false,
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
});

describe("confidence scoring and review (end to end)", () => {
	const originalCwd = process.cwd();
	let server: http.Server;
	let projectDir: string;
	let localesDir: string;

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => {
				const { messages } = JSON.parse(body) as { messages: { content: string }[] };
				const text = messages[messages.length - 1].content;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						choices: [
							{
								message: { role: "assistant", content: replies[text] },
								finish_reason: "stop",
							},
						],
					})
				);
			});
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		target.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		// Only the stand-in OpenAI provider is configured.
		for (const key of providerKeys) {
			vi.stubEnv(key, key === "OPENAI_API_KEY" ? "test-key" : "");
		}
		vi.spyOn(RetryHelper, "delay").mockResolvedValue();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "clear").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	beforeEach(() => {
		vi.mocked(console.log).mockClear();

		// The run writes .localize-cache/ into the working directory: use a temp project.
		projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "locai-review-")));
		localesDir = path.join(projectDir, "locales");
		fs.mkdirSync(localesDir);
		fs.writeFileSync(
			path.join(localesDir, "en.json"),
			JSON.stringify({
				greeting: "Welcome back, {name}!",
				inbox: { count: "You have {count} new messages." },
				files: { delete: "Delete <b>{file}</b>?" },
			})
		);
		process.chdir(projectDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		server.close();
		await once(server, "close");
	});

	it("scores every translation, queues the low ones and applies approved ones", async () => {
		const processTranslations = vi.spyOn(Orchestrator.prototype, "processTranslations");

		await translateFile(path.join(localesDir, "en.json"), {
			...translateOptions(localesDir),
			confidenceScoring: { enabled: true, saveReviewQueue: true },
		});

		// Every translation got a score
		expect(processTranslations).toHaveBeenCalledTimes(1);
		const results: TranslationResult[] = await processTranslations.mock.results[0].value;
		const byKey = Object.fromEntries(results.map((result) => [result.key, result]));
		expect(Object.keys(byKey).sort()).toEqual(["files.delete", "greeting", "inbox.count"]);
		for (const result of results) {
			expect(result.confidence?.score).toEqual(expect.any(Number));
		}
		expect(byKey.greeting).toMatchObject({ success: true, autoApproved: true });
		expect(byKey["inbox.count"]).toMatchObject({ success: true, needsReview: true });
		expect(byKey["files.delete"]).toMatchObject({ success: false, rejected: true });

		// The flagged translation is written; the rejected one is not
		const translated = readJson(path.join(localesDir, "es.json"));
		expect(translated.greeting).toBe("¡Bienvenido de nuevo, {name}!");
		expect(translated.inbox.count).toBe(byKey["inbox.count"].translated);
		expect(translated.files).toBeUndefined();

		// Both low-confidence translations are queued for review, the good one is not
		const queue: ReviewQueueFile = readJson(
			path.join(projectDir, ".localize-cache", "review-queue.json")
		);
		const queued = Object.fromEntries(queue.items.map((item) => [item.key, item]));
		expect(Object.keys(queued).sort()).toEqual(["files.delete", "inbox.count"]);
		const flagged = queued["inbox.count"];
		expect(flagged).toMatchObject({
			language: "es",
			source: "You have {count} new messages.",
			translation: translated.inbox.count,
			rejected: false,
		});
		expect(flagged.confidence.score).toBeGreaterThanOrEqual(0.5);
		expect(flagged.confidence.score).toBeLessThan(0.7);
		const rejected = queued["files.delete"];
		expect(rejected).toMatchObject({
			language: "es",
			source: "Delete <b>{file}</b>?",
			translation: byKey["files.delete"].translated,
			rejected: true,
		});
		expect(rejected.confidence.score).toBeLessThan(0.5);

		// `locai review` loads that queue and writes the approved translations
		vi.mocked(prompts).mockResolvedValue({ action: "approve" });
		const review = new ReviewCommand({ localesDir, source: "en" });
		expect(review.loadReviewQueue()).toBe(true);
		await review.startReview();

		const shown = vi.mocked(prompts).mock.calls.map(([question]) => question);
		expect(shown).toHaveLength(2);
		expect(shown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringContaining(`Translation: "${flagged.translation}"`),
				}),
				expect.objectContaining({
					message: expect.stringContaining(`Translation: "${rejected.translation}"`),
				}),
			])
		);

		const reviewed = readJson(path.join(localesDir, "es.json"));
		expect(reviewed).toEqual({
			greeting: translated.greeting,
			inbox: { count: translated.inbox.count },
			files: { delete: rejected.translation },
		});
	});

	it("lists low scores without saving a review queue when only minConfidence is set", async () => {
		await translateFile(path.join(localesDir, "en.json"), {
			...translateOptions(localesDir),
			minConfidence: 0.95,
		});

		const translated = readJson(path.join(localesDir, "es.json"));
		expect(Object.keys(translated).sort()).toEqual(["greeting", "inbox"]);
		expect(fs.existsSync(path.join(projectDir, ".localize-cache", "review-queue.json"))).toBe(
			false
		);

		const logged = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
		expect(logged).toEqual(
			expect.arrayContaining([
				expect.stringContaining("3 translations scored"),
				expect.stringContaining("Auto-approved (score >= 0.9): 1"),
				expect.stringContaining("Need review (score < 0.95): 1"),
				expect.stringContaining("Rejected, not written (score < 0.5): 1"),
				expect.stringMatching(/es inbox\.count: \[LOW\]/),
				expect.stringMatching(/es files\.delete: \[VLOW\] .*\(rejected\)/),
			])
		);
	});
});
