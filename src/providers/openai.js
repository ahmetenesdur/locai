import axios from "axios";
import BaseProvider from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for OpenAI (GPT) models.
 */
class OpenAIProvider extends BaseProvider {
	/**
	 * Create a new OpenAIProvider instance.
	 * @param {Object} config - Provider configuration.
	 */
	constructor(config = {}) {
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

	getApiKey() {
		return process.env.OPENAI_API_KEY;
	}

	getEndpoint() {
		return "/chat/completions";
	}

	/**
	 * Translate text using OpenAI.
	 * @param {string} text - Text to translate.
	 * @param {string} sourceLang - Source language code.
	 * @param {string} targetLang - Target language code.
	 * @param {Object} options - Translation options.
	 * @returns {Promise<string>} - Translated text.
	 */
	async translate(text, sourceLang, targetLang, options = {}) {
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
				} catch (error) {
					this.handleApiError(error, this.name);
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
}

// Lazy singleton - created on first use
let openaiProvider = null;

function getProvider() {
	if (!openaiProvider) {
		openaiProvider = new OpenAIProvider();
	}
	return openaiProvider;
}

// Export both class and legacy functions
async function translate(text, sourceLang, targetLang, options) {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt, options = {}) {
	return getProvider().analyze(prompt, options);
}

// Add analyze method to the class
OpenAIProvider.prototype.analyze = async function (prompt, options = {}) {
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
			} catch (error) {
				this.handleApiError(error, this.name);
			}
		},
		{
			maxRetries: options.maxRetries || 2,
			initialDelay: options.initialDelay || 1000,
			context: "OpenAI Provider Analysis",
		}
	);
};

export { translate, analyze, OpenAIProvider };
