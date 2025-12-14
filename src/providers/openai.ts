import axios, { AxiosInstance } from "axios";
import BaseProvider, { ProviderConfig, TranslateOptions } from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for OpenAI (GPT) models.
 */
class OpenAIProvider extends BaseProvider {
	private client: AxiosInstance;

	/**
	 * Create a new OpenAIProvider instance.
	 * @param {ProviderConfig} config - Provider configuration.
	 */
	constructor(config: ProviderConfig = {}) {
		super("openai", config);

		this.client = axios.create({
			baseURL: "https://api.openai.com/v1",
			headers: {
				...this.commonHeaders,
				Authorization: `Bearer ${this.getApiKey()}`,
			},
			timeout: 30000,
			maxRedirects: 0,
			validateStatus: (status) => status < 500,
		});
	}

	getApiKey(): string | undefined {
		return process.env.OPENAI_API_KEY;
	}

	getEndpoint(): string {
		return "/chat/completions";
	}

	/**
	 * Translate text using OpenAI.
	 */
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): Promise<string> {
		this.validateRequest(text, sourceLang, targetLang);

		const config = this.getConfig(options.apiConfig?.openai);
		const promptData = getPrompt("openai", sourceLang, targetLang, text, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model || "gpt-4o",
						...promptData,
						temperature: config.temperature,
						max_completion_tokens: config.maxTokens || config.max_tokens,
					});

					this.validateResponse(response, this.name);
					const translation = this.extractTranslation(response.data, this.name);
					return this.sanitizeTranslation(translation);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error; // handleApiError throws, but TS might need this
				}
			},
			{
				maxRetries: options.retryOptions?.maxRetries || 2,
				initialDelay: options.retryOptions?.initialDelay || 1000,
				context: "OpenAI Provider",
				logContext: {
					source: sourceLang,
					target: targetLang,
				},
			}
		);
	}

	async analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "gpt-4o",
			temperature: options.temperature || 0.2,
			maxTokens: options.maxTokens || 1000,
		});

		const promptData = getAnalysisPrompt("openai", prompt, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model,
						...promptData,
						temperature: config.temperature,
						max_completion_tokens: config.maxTokens || config.max_tokens,
					});

					this.validateResponse(response, this.name);
					const result = this.extractTranslation(response.data, this.name);
					return this.sanitizeTranslation(result);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "OpenAI Provider Analysis",
			}
		);
	}

	async chat(messages: any[], options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "gpt-4o",
			temperature: options.temperature || 0.3,
			maxTokens: options.maxTokens || 2000,
		});

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model,
						messages: messages,
						temperature: config.temperature,
						max_completion_tokens: config.maxTokens || config.max_tokens,
						response_format: options.json ? { type: "json_object" } : undefined,
					});

					this.validateResponse(response, this.name);
					const result = this.extractTranslation(response.data, this.name);
					return this.sanitizeTranslation(result);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "OpenAI Provider Chat",
			}
		);
	}
	async embed(text: string, options: ProviderConfig = {}): Promise<number[]> {
		const config = this.getConfig({
			model: options.model || "text-embedding-3-small",
		});

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post("/embeddings", {
						model: config.model,
						input: text,
					});

					if (response.data && response.data.data && response.data.data[0]) {
						return response.data.data[0].embedding;
					}
					return [];
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "OpenAI Provider Embed",
			}
		);
	}

	async embedBatch(texts: string[], options: ProviderConfig = {}): Promise<number[][]> {
		const config = this.getConfig({
			model: options.model || "text-embedding-3-small",
		});

		return RetryHelper.withRetry(
			async () => {
				try {
					// OpenAI suggests replacing newlines for best results
					const cleanTexts = texts.map((t) => t.replace(/\n/g, " "));

					const response = await this.client.post("/embeddings", {
						model: config.model,
						input: cleanTexts,
					});

					if (response.data && response.data.data) {
						return response.data.data
							.sort((a: any, b: any) => a.index - b.index)
							.map((item: any) => item.embedding);
					}
					return [];
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "OpenAI Provider Embed Batch",
			}
		);
	}
}

// Lazy singleton - created on first use
let openaiProvider: OpenAIProvider | null = null;

function getProvider(): OpenAIProvider {
	if (!openaiProvider) {
		openaiProvider = new OpenAIProvider();
	}
	return openaiProvider;
}

// Export both class and legacy functions
async function translate(
	text: string,
	sourceLang: string,
	targetLang: string,
	options: TranslateOptions = {}
): Promise<string> {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
	return getProvider().analyze(prompt, options);
}

async function chat(messages: any[], options: ProviderConfig = {}): Promise<string> {
	return getProvider().chat(messages, options);
}

async function embed(text: string, options: ProviderConfig = {}): Promise<number[]> {
	return getProvider().embed(text, options);
}

async function embedBatch(texts: string[], options: ProviderConfig = {}): Promise<number[][]> {
	return getProvider().embedBatch(texts, options);
}

export { translate, analyze, chat, embed, embedBatch, OpenAIProvider };
