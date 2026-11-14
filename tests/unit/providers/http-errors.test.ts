import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { AxiosInstance } from "axios";
import ErrorHelper from "../../../src/utils/error-helper.js";
import RetryHelper from "../../../src/utils/retry-helper.js";
import { OpenAIProvider } from "../../../src/providers/openai.js";
import { AnthropicProvider } from "../../../src/providers/anthropic.js";
import { GeminiProvider } from "../../../src/providers/gemini.js";
import { DeepSeekProvider } from "../../../src/providers/deepseek.js";
import { XAIProvider } from "../../../src/providers/xai.js";
import { DashScopeProvider } from "../../../src/providers/dashscope.js";

// Real HTTP round trips against a local server, so axios applies its own status handling.
type Provider =
	| OpenAIProvider
	| AnthropicProvider
	| GeminiProvider
	| DeepSeekProvider
	| XAIProvider
	| DashScopeProvider;

interface Setup {
	provider: Provider;
	client: AxiosInstance;
}

// `client` is private; bracket access on the concrete class keeps it type-checked.
function setup<P extends Provider>(provider: P, client: (p: P) => AxiosInstance): Setup {
	return { provider, client: client(provider) };
}

const providers: Array<[string, string, () => Setup]> = [
	["openai", "OPENAI_API_KEY", () => setup(new OpenAIProvider(), (p) => p["client"])],
	["anthropic", "ANTHROPIC_API_KEY", () => setup(new AnthropicProvider(), (p) => p["client"])],
	["gemini", "GEMINI_API_KEY", () => setup(new GeminiProvider(), (p) => p["client"])],
	["deepseek", "DEEPSEEK_API_KEY", () => setup(new DeepSeekProvider(), (p) => p["client"])],
	["xai", "XAI_API_KEY", () => setup(new XAIProvider(), (p) => p["client"])],
	["dashscope", "DASHSCOPE_API_KEY", () => setup(new DashScopeProvider(), (p) => p["client"])],
];

describe("provider HTTP error handling", () => {
	let server: http.Server;
	let baseURL: string;
	let status = 500;

	beforeAll(async () => {
		server = http.createServer((_req, res) => {
			res.writeHead(status, { "Content-Type": "application/json", "Retry-After": "7" });
			res.end(JSON.stringify({ error: { message: `upstream said ${status}` } }));
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	describe.each(providers)("%s", (_name, envKey, create) => {
		let provider: Provider;

		beforeEach(() => {
			vi.spyOn(RetryHelper, "delay").mockResolvedValue();
			vi.stubEnv(envKey, "test-key");
			const created = create();
			created.client.defaults.baseURL = baseURL;
			provider = created.provider;
		});

		afterEach(() => {
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		});

		it("reports a 401 as an authentication error", async () => {
			status = 401;
			await expect(provider.translate("Hello", "en", "tr")).rejects.toMatchObject({
				code: ErrorHelper.ErrorCodes.API_AUTH_FAILED,
			});
		});

		it("reports a 429 as a rate-limit error with the server's retry-after", async () => {
			status = 429;
			await expect(provider.translate("Hello", "en", "tr")).rejects.toMatchObject({
				code: ErrorHelper.ErrorCodes.API_RATE_LIMIT,
				details: expect.objectContaining({ retryAfter: "7" }),
			});
		});
	});
});
