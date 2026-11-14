import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { AxiosInstance } from "axios";
import { SourceCodeAnalyzer } from "../../../../../src/services/source-analyzer.js";
import Pipeline from "../../../../../src/core/pipeline/Pipeline.js";
import ContextEnrichmentStep from "../../../../../src/core/pipeline/steps/ContextEnrichmentStep.js";
import TranslationStep from "../../../../../src/core/pipeline/steps/TranslationStep.js";
import {
	createTranslationContext,
	PipelineOptions,
} from "../../../../../src/core/pipeline/context.js";
import ProviderFactory from "../../../../../src/core/provider-factory.js";
import RetryHelper from "../../../../../src/utils/retry-helper.js";
import { OpenAIProvider } from "../../../../../src/providers/openai.js";
import { AnthropicProvider } from "../../../../../src/providers/anthropic.js";
import { GeminiProvider } from "../../../../../src/providers/gemini.js";
import { DeepSeekProvider } from "../../../../../src/providers/deepseek.js";
import { XAIProvider } from "../../../../../src/providers/xai.js";
import { DashScopeProvider } from "../../../../../src/providers/dashscope.js";

// Deep context end to end: the real analyzer reads the fixture, the real enrichment and
// translation steps run, and real providers send their request to a local server. Only the
// provider lookup is bypassed, so no API keys are needed.
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

const pipelineOptions: PipelineOptions = {
	source: "en",
	context: {
		categories: {},
		detection: { threshold: 2, minConfidence: 0.6 },
		fallback: { category: "general", prompt: "Provide a natural translation" },
	},
};

/** Every string in a request body: all the text the model receives. */
const textOf = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(textOf).join("\n");
	if (value && typeof value === "object") return Object.values(value).map(textOf).join("\n");
	return "";
};

describe("deep context in the translation request", () => {
	const fixture = path.join(process.cwd(), "tests", "fixtures", "DeepContextTest.tsx");
	let analyzer: SourceCodeAnalyzer;
	let server: http.Server;
	let baseURL: string;
	let requests: unknown[] = [];

	beforeAll(async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		analyzer = new SourceCodeAnalyzer(process.cwd());
		await analyzer.initialize([fixture]);
		vi.restoreAllMocks();

		server = http.createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => {
				requests.push(JSON.parse(body));
				const reply = req.url?.includes(":generateContent")
					? { candidates: [{ content: { parts: [{ text: "Kaydet" }] } }] }
					: req.url === "/messages"
						? { content: [{ type: "text", text: "Kaydet" }] }
						: { choices: [{ message: { content: "Kaydet" } }] };
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(reply));
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	describe.each(providers)("%s", (name, envKey, create) => {
		beforeEach(() => {
			requests = [];
			vi.spyOn(RetryHelper, "delay").mockResolvedValue();
			vi.stubEnv(envKey, "test-key");
			const { provider, client } = create();
			client.defaults.baseURL = baseURL;
			vi.spyOn(ProviderFactory, "getProvider").mockReturnValue(provider);
		});

		afterEach(() => {
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
		});

		/** Translates the fixture's `action.save.tooltip` key and returns the request text. */
		const translateTooltip = async (deepContext: boolean): Promise<string> => {
			const pipeline = new Pipeline()
				.use(new ContextEnrichmentStep(analyzer, deepContext))
				.use(new TranslationStep({ apiProvider: name }));
			const context = createTranslationContext(
				"action.save.tooltip",
				"Save your changes",
				"en",
				"tr",
				pipelineOptions
			);

			await pipeline.execute(context);

			expect(context.translatedText).toBe("Kaydet");
			expect(requests).toHaveLength(1);
			return textOf(requests[0]);
		};

		it("sends the file, component, comment, props and code around the key", async () => {
			const prompt = await translateTooltip(true);

			expect(prompt).toContain(path.join("tests", "fixtures", "DeepContextTest.tsx"));
			expect(prompt).toContain("Component: DeepContextTestComponent");
			expect(prompt).toContain("context: tooltip for save button");
			expect(prompt).toContain('variant="primary"');
			expect(prompt).toContain('<div title={t("action.save.tooltip")} variant="primary">');
		});

		it("sends no source code when deep context is disabled", async () => {
			const prompt = await translateTooltip(false);

			expect(prompt).not.toContain("DeepContextTestComponent");
			expect(prompt).not.toContain("action.save.tooltip");
		});
	});
});
