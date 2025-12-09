import axios from "axios";
import BaseProvider from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for DeepSeek API.
 */
class DeepSeekProvider extends BaseProvider {
	/**
	 * Create a new DeepSeekProvider instance.
	 * @param {Object} config - Provider configuration.
	 */
	constructor(config = {}) {
		super("deepseek", config);

		this.client = axios.create({
			baseURL: "https://api.deepseek.com/v1",
			headers: {
				...this.commonHeaders,
				Authorization: `Bearer ${this.getApiKey()}`,
			},
			timeout: 45000,
			maxRedirects: 0,
			validateStatus: (status) => status < 500,
		});
	}

	getApiKey() {
		return process.env.DEEPSEEK_API_KEY;
	}

	getEndpoint() {
		return "/chat/completions";
	}

	/**
	 * Translate text using DeepSeek.
	 * @param {string} text - Text to translate.
	 * @param {string} sourceLang - Source language code.
	 * @param {string} targetLang - Target language code.
	 * @param {Object} options - Translation options.
	 * @returns {Promise<string>} - Translated text.
	 */
	async translate(text, sourceLang, targetLang, options = {}) {
		this.validateRequest(text, sourceLang, targetLang);

		const config = this.getConfig(options.apiConfig?.deepseek);
		const promptData = getPrompt("deepseek", sourceLang, targetLang, text, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model || "deepseek-chat",
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
				maxRetries: options.retryOptions?.maxRetries || 3,
				initialDelay: options.retryOptions?.initialDelay || 2000,
				context: "DeepSeek Provider",
				logContext: {
					source: sourceLang,
					target: targetLang,
				},
			}
		);
	}

	async analyze(prompt, options = {}) {
		const config = this.getConfig({
			model: options.model || "deepseek-chat",
			temperature: options.temperature || 0.2,
			maxTokens: options.maxTokens || 1000,
		});

		const promptData = getAnalysisPrompt("deepseek", prompt, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(this.getEndpoint(), {
						model: config.model,
						...promptData,
						temperature: config.temperature,
						max_tokens: config.maxTokens,
					});

					this.validateResponse(response, this.name);
					const result = this.extractTranslation(response.data, this.name);
					return this.sanitizeTranslation(result);
				} catch (error) {
					this.handleApiError(error, this.name);
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "DeepSeek Provider Analysis",
			}
		);
	}
}

// Lazy singleton - created on first use
let deepseekProvider = null;

function getProvider() {
	if (!deepseekProvider) {
		deepseekProvider = new DeepSeekProvider();
	}
	return deepseekProvider;
}

// Export both class and legacy functions
async function translate(text, sourceLang, targetLang, options) {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt, options = {}) {
	return getProvider().analyze(prompt, options);
}

export { translate, analyze, DeepSeekProvider };
