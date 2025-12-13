import axios, { AxiosInstance } from "axios";
import BaseProvider, { ProviderConfig, TranslateOptions } from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for Alibaba DashScope (Qwen) models.
 */
class DashScopeProvider extends BaseProvider {
	private client: AxiosInstance;
	private generationClient: AxiosInstance;

	/**
	 * Create a new DashScopeProvider instance.
	 * @param {ProviderConfig} config - Provider configuration.
	 */
	constructor(config: ProviderConfig = {}) {
		super("dashscope", config);

		this.client = axios.create({
			baseURL: "https://dashscope-intl.aliyuncs.com",
			headers: {
				...this.commonHeaders,
				Authorization: `Bearer ${this.getApiKey()}`,
			},
			timeout: 30000,
			maxRedirects: 0,
			validateStatus: (status) => status < 500,
		});

		// Generation client for analysis
		this.generationClient = axios.create({
			baseURL: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
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
		return process.env.DASHSCOPE_API_KEY;
	}

	getEndpoint(): string {
		return "/compatible-mode/v1/chat/completions";
	}

	getGenerationEndpoint(): string {
		return "/text-generation/generation";
	}

	/**
	 * Translate text using DashScope.
	 */
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): Promise<string> {
		this.validateRequest(text, sourceLang, targetLang);

		const config = this.getConfig(options.apiConfig?.dashscope);
		const promptData = getPrompt("dashscope", sourceLang, targetLang, text, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model || "qwen-plus",
						...promptData,
						temperature: config.temperature || 0.3,
						max_tokens: config.maxTokens || 2000,
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
				context: "DashScope Provider",
				logContext: {
					source: sourceLang,
					target: targetLang,
				},
			}
		);
	}

	async analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "qwen-plus",
			temperature: options.temperature || 0.2,
			maxTokens: options.maxTokens || 1000,
		});

		const promptData = getAnalysisPrompt("dashscope", prompt, {
			...options,
			...config,
		});

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.generationClient.post(
						this.getGenerationEndpoint(),
						{
							...promptData,
						}
					);

					if (!response.data?.output?.text) {
						throw new Error("Invalid response format from DashScope API");
					}

					const result = response.data.output.text.trim();
					return this.sanitizeTranslation(result);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "DashScope Provider Analysis",
			}
		);
	}
}

// Lazy singleton - created on first use
let dashscopeProvider: DashScopeProvider | null = null;

function getProvider(): DashScopeProvider {
	if (!dashscopeProvider) {
		dashscopeProvider = new DashScopeProvider();
	}
	return dashscopeProvider;
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

export { translate, analyze, DashScopeProvider };
