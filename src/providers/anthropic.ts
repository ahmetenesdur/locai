import axios, { AxiosInstance } from "axios";
import BaseProvider, { ProviderConfig, TranslateOptions } from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for Anthropic (Claude) models.
 */
class AnthropicProvider extends BaseProvider {
	private client: AxiosInstance;

	/**
	 * Create a new AnthropicProvider instance.
	 * @param {ProviderConfig} config - Provider configuration.
	 */
	constructor(config: ProviderConfig = {}) {
		super("anthropic", config);

		this.client = axios.create({
			baseURL: "https://api.anthropic.com/v1",
			headers: {
				...this.commonHeaders,
				"x-api-key": this.getApiKey(),
				"anthropic-version": "2023-06-01",
			},
			timeout: 30000,
			maxRedirects: 0,
			validateStatus: (status) => status < 500,
		});
	}

	getApiKey(): string | undefined {
		return process.env.ANTHROPIC_API_KEY;
	}

	getEndpoint(): string {
		return "/messages";
	}

	/**
	 * Translate text using Anthropic.
	 */
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): Promise<string> {
		this.validateRequest(text, sourceLang, targetLang);

		// Prioritize user config > options config > default model
		// Anthropic models: claude-3-5-sonnet-latest, claude-3-5-haiku-latest, claude-3-opus-latest
		const config = this.getConfig(options.apiConfig?.anthropic);
		const model = config.model || "claude-haiku-4-5-20251001";

		const promptData = getPrompt("anthropic", sourceLang, targetLang, text, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: model,
						...promptData, // Contains { system: "...", messages: [...] }
						max_tokens: config.maxTokens || 4096,
						temperature: config.temperature,
					});

					this.validateResponse(response, this.name);
					const translation = this.extractTranslation(response.data, this.name);
					return this.sanitizeTranslation(translation);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.retryOptions?.maxRetries || 2,
				initialDelay: options.retryOptions?.initialDelay || 1000,
				context: "Anthropic Provider",
				logContext: {
					source: sourceLang,
					target: targetLang,
				},
			}
		);
	}

	async analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "claude-3-5-sonnet-latest",
			temperature: options.temperature || 0.2,
			maxTokens: options.maxTokens || 1000,
		});

		const promptData = getAnalysisPrompt("anthropic", prompt, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model,
						...promptData,
						max_tokens: config.maxTokens,
						temperature: config.temperature,
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
				context: "Anthropic Provider Analysis",
			}
		);
	}

	async chat(messages: any[], options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "claude-3-5-sonnet-latest",
			temperature: options.temperature || 0.3,
			maxTokens: options.maxTokens || 4096,
		});

		// Anthropic requires system prompt to be top-level, separate from messages array
		// Note: This simple implementation assumes messages passed in might be mixed.
		// Ideally, the caller should separate system prompt, but we can do a quick check here.

		let systemPrompt: string | undefined = undefined;
		const cleanMessages = messages.filter((msg) => {
			if (msg.role === "system") {
				systemPrompt = msg.content;
				return false;
			}
			return true;
		});

		return RetryHelper.withRetry(
			async () => {
				try {
					const payload: any = {
						model: config.model,
						messages: cleanMessages,
						max_tokens: config.maxTokens,
						temperature: config.temperature,
					};

					if (systemPrompt) {
						payload.system = systemPrompt;
					}

					const response = await this.client.post(this.getEndpoint(), payload);

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
				context: "Anthropic Provider Chat",
			}
		);
	}

	// Override extractTranslation to handle Anthropic's specific response structure
	extractTranslation(response: any, providerName: string): string {
		// Check for error response first
		if (response.error) {
			const errorMsg =
				response.error.message || response.error.error || JSON.stringify(response.error);
			throw new Error(`api: ${providerName} - ${errorMsg}`);
		}

		// Anthropic format: { content: [{ type: 'text', text: '...' }] }
		if (response.content && Array.isArray(response.content) && response.content.length > 0) {
			const textBlock = response.content.find((block: any) => block.type === "text");
			if (textBlock && textBlock.text) {
				return textBlock.text.trim();
			}
		}

		// Fallback to base implementation for other structures (though unlikely for Anthropic)
		return super.extractTranslation(response, providerName);
	}
}

// Lazy singleton - created on first use
let anthropicProvider: AnthropicProvider | null = null;

function getProvider(): AnthropicProvider {
	if (!anthropicProvider) {
		anthropicProvider = new AnthropicProvider();
	}
	return anthropicProvider;
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

export { translate, analyze, chat, AnthropicProvider };
