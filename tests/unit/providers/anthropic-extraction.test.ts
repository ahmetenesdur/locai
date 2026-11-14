import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import RetryHelper from "../../../src/utils/retry-helper.js";
import { AnthropicProvider } from "../../../src/providers/anthropic.js";

// Real HTTP round trips: a local server answers 200 with whatever Messages body the test sets.
describe("AnthropicProvider response extraction", () => {
	let server: http.Server;
	let baseURL: string;
	let body: unknown;
	let provider: AnthropicProvider;

	beforeAll(async () => {
		server = http.createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(body));
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	beforeEach(() => {
		vi.spyOn(RetryHelper, "delay").mockResolvedValue();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
		provider = new AnthropicProvider();
		provider["client"].defaults.baseURL = baseURL;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("returns the text block of a normal reply", async () => {
		body = { content: [{ type: "text", text: " Merhaba " }] };
		await expect(provider.translate("Hello", "en", "tr")).resolves.toBe("Merhaba");
	});

	it.each([
		["an empty content array", { content: [] }],
		[
			"only a tool_use block",
			{ content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: {} }] },
		],
		["a text block with empty text", { content: [{ type: "text", text: "" }] }],
	])("reports an extraction error for %s", async (_label, reply) => {
		body = reply;
		await expect(provider.translate("Hello", "en", "tr")).rejects.toThrow(
			"Unable to extract translation from anthropic response"
		);
		await expect(provider.chat([{ role: "user", content: "Hi" }])).rejects.toThrow(
			"Unable to extract translation from anthropic response"
		);
	});
});
