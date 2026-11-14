import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import type { AddressInfo } from "node:net";
import axios from "axios";
import Orchestrator, { OrchestratorOptions } from "../../../src/core/orchestrator.js";
import { loadConfig } from "../../../src/config/index.js";
import InputValidator from "../../../src/utils/input-validator.js";
import RetryHelper from "../../../src/utils/retry-helper.js";

// Real pipeline + real OpenAI provider, talking to a local server instead of the API.
// TTL expiry is real wall-clock behavior: lru-cache reads `performance.now()` through a
// reference captured at import and caches it per tick, so fake timers cannot move its clock.
const TTL_MS = 50;

describe("translation cache (real pipeline)", () => {
	let server: http.Server;
	let baseURL: string;
	let requests = 0;
	let orchestrator: Orchestrator | null = null;

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			req.resume();
			req.on("end", () => {
				requests++;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ choices: [{ message: { content: `Hola ${requests}` } }] })
				);
			});
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
	});

	afterAll(async () => {
		server.close();
		await once(server, "close");
	});

	beforeEach(() => {
		requests = 0;
		vi.stubEnv("OPENAI_API_KEY", "test-key");
		vi.spyOn(RetryHelper, "delay").mockResolvedValue();
		// The provider builds its axios client lazily; point it at the local server.
		const create = axios.create.bind(axios);
		vi.spyOn(axios, "create").mockImplementation((config) => create({ ...config, baseURL }));
	});

	afterEach(() => {
		orchestrator?.destroy();
		orchestrator = null;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	const baseOptions: OrchestratorOptions = {
		source: "en",
		apiProvider: "openai",
		useFallback: false,
		context: {
			categories: {},
			detection: { threshold: 2, minConfidence: 0.6 },
			fallback: { category: "general", prompt: "Provide a natural translation" },
		},
		deepContext: false,
		qualityChecks: { enabled: false },
	};

	it("serves a repeated translation from the cache without calling the provider", async () => {
		orchestrator = new Orchestrator(baseOptions);

		const first = await orchestrator.processTranslation("greeting", "Hello", "es", {});
		const second = await orchestrator.processTranslation("greeting", "Hello", "es", {});

		expect(first.translated).toBe("Hola 1");
		expect(second.translated).toBe("Hola 1");
		expect(second.fromCache).toBe(true);
		expect(requests).toBe(1);
		expect(orchestrator.getStatus().cache).toEqual({
			hits: 1,
			misses: 1,
			stored: 1,
			size: 1,
			capacity: 1000,
			hitRate: 0.5,
		});
	});

	it("translates an expired entry again, even with the deprecated stale options set", async () => {
		orchestrator = new Orchestrator({
			...baseOptions,
			cacheTTL: TTL_MS,
			allowStaleCache: true,
			staleWhileRevalidate: true,
		});

		await orchestrator.processTranslation("greeting", "Hello", "es", {});
		await sleep(TTL_MS + 20);
		const expired = await orchestrator.processTranslation("greeting", "Hello", "es", {});

		expect(expired.translated).toBe("Hola 2");
		expect(expired.fromCache).toBeUndefined();
		expect(requests).toBe(2);
		expect(orchestrator.getStatus().cache).toEqual({
			hits: 0,
			misses: 2,
			stored: 2,
			size: 1,
			capacity: 1000,
			hitRate: 0,
		});
	});
});

describe("deprecated cache config keys", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "locai-cache-config-"));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("still load, validate and construct an Orchestrator", async () => {
		await fs.writeFile(
			path.join(dir, "localize.config.ts"),
			`export default {
	source: "en",
	targets: ["es"],
	localesDir: "./locales",
	cacheTTL: 60000,
	allowStaleCache: true,
	staleWhileRevalidate: true,
};
`,
			"utf-8"
		);

		const { config } = await loadConfig(dir);

		expect(config.allowStaleCache).toBe(true);
		expect(config.staleWhileRevalidate).toBe(true);
		expect(() => InputValidator.validateConfig(config)).not.toThrow();

		const orchestrator = new Orchestrator({ ...config, deepContext: false });
		expect(orchestrator.translationCache?.ttl).toBe(60000);
		orchestrator.destroy();
	});
});
