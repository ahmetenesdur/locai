import axios from "axios";
import BaseProvider from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";
/**
 * Provider implementation for X.AI (Grok) models.
 */
class XAIProvider extends BaseProvider {
    client;
    /**
     * Create a new XAIProvider instance.
     * @param {ProviderConfig} config - Provider configuration.
     */
    constructor(config = {}) {
        super("xai", config);
        this.client = axios.create({
            baseURL: "https://api.x.ai/v1",
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
        return process.env.XAI_API_KEY;
    }
    getEndpoint() {
        return "/chat/completions";
    }
    /**
     * Translate text using X.AI.
     */
    async translate(text, sourceLang, targetLang, options = {}) {
        this.validateRequest(text, sourceLang, targetLang);
        const config = this.getConfig(options.apiConfig?.xai);
        const promptData = getPrompt("xai", sourceLang, targetLang, text, options);
        return RetryHelper.withRetry(async () => {
            try {
                const response = await this.client.post(this.getEndpoint(), {
                    model: config.model || "grok-4",
                    ...promptData,
                    temperature: config.temperature || 0.3,
                    max_tokens: config.maxTokens || 2000,
                });
                this.validateResponse(response, this.name);
                const translation = this.extractTranslation(response.data, this.name);
                return this.sanitizeTranslation(translation);
            }
            catch (error) {
                this.handleApiError(error, this.name);
                throw error;
            }
        }, {
            maxRetries: options.retryOptions?.maxRetries || 2,
            initialDelay: options.retryOptions?.initialDelay || 1000,
            context: "X.AI Provider",
            logContext: {
                source: sourceLang,
                target: targetLang,
            },
        });
    }
    async analyze(prompt, options = {}) {
        const config = this.getConfig({
            model: options.model || "grok-4",
            temperature: options.temperature || 0.2,
            maxTokens: options.maxTokens || 1000,
        });
        const promptData = getAnalysisPrompt("xai", prompt, options);
        return RetryHelper.withRetry(async () => {
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
            }
            catch (error) {
                this.handleApiError(error, this.name);
                throw error;
            }
        }, {
            maxRetries: options.maxRetries || 2,
            initialDelay: options.initialDelay || 1000,
            context: "X.AI Provider Analysis",
        });
    }
}
// Lazy singleton - created on first use
let xaiProvider = null;
function getProvider() {
    if (!xaiProvider) {
        xaiProvider = new XAIProvider();
    }
    return xaiProvider;
}
// Export both class and legacy functions
async function translate(text, sourceLang, targetLang, options = {}) {
    return getProvider().translate(text, sourceLang, targetLang, options);
}
async function analyze(prompt, options = {}) {
    return getProvider().analyze(prompt, options);
}
export { translate, analyze, XAIProvider };
