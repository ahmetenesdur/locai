import axios from "axios";
import BaseProvider from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for Alibaba DashScope (Qwen) models.
 */
class DashScopeProvider extends BaseProvider {
	/**
	 * Create a new DashScopeProvider instance.
	 * @param {Object} config - Provider configuration.
	 */
	constructor(config = {}) {
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

	getApiKey() {
		return process.env.DASHSCOPE_API_KEY;
	}

	getEndpoint() {
		return "/compatible-mode/v1/chat/completions";
	}

	getGenerationEndpoint() {
		return "/text-generation/generation";
	}

	/**
	 * Translate text using DashScope.
	 * @param {string} text - Text to translate.
	 * @param {string} sourceLang - Source language code.
	 * @param {string} targetLang - Target language code.
	 * @param {Object} options - Translation options.
	 * @returns {Promise<string>} - Translated text.
	 */
	async translate(text, sourceLang, targetLang, options = {}) {
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
				} catch (error) {
					this.handleApiError(error, this.name);
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

	async analyze(prompt, options = {}) {
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
				} catch (error) {
					this.handleApiError(error, this.name);
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
let dashscopeProvider = null;

function getProvider() {
	if (!dashscopeProvider) {
		dashscopeProvider = new DashScopeProvider();
	}
	return dashscopeProvider;
}

// Export both class and legacy functions
async function translate(text, sourceLang, targetLang, options) {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt, options = {}) {
	return getProvider().analyze(prompt, options);
}

export { translate, analyze, DashScopeProvider };
