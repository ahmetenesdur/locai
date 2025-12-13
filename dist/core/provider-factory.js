import * as deepseekProvider from "../providers/deepseek.js";
import * as geminiProvider from "../providers/gemini.js";
import * as openaiProvider from "../providers/openai.js";
import * as dashscopeProvider from "../providers/dashscope.js";
import * as xaiProvider from "../providers/xai.js";
import FallbackProvider from "./fallback-provider.js";
import rateLimiter from "../utils/rate-limiter.js";
/**
 * Factory for creating and managing AI providers.
 * Handles provider instantiation, configuration, and fallback chains.
 */
class ProviderFactory {
    /**
     * Get provider instance with intelligent fallback support.
     * @param {string} providerName - Name of the primary provider.
     * @param {boolean} [useFallback=true] - Whether to use fallback chain on failure.
     * @param {Object} [config=null] - Optional configuration overrides.
     * @returns {AIProvider} - Provider instance or wrapped FallbackProvider.
     * @throws {Error} If provider is not found or configured.
     */
    static getProvider(providerName, useFallback = true, config = null) {
        const providers = {
            dashscope: dashscopeProvider,
            xai: xaiProvider,
            openai: openaiProvider,
            deepseek: deepseekProvider,
            gemini: geminiProvider,
        };
        const normalizedProviderName = (providerName || "").toLowerCase();
        if (!useFallback) {
            const selected = providers[normalizedProviderName];
            if (!selected) {
                throw new Error(`Provider ${providerName} not found or not configured`);
            }
            if (!this.isProviderConfigured(normalizedProviderName)) {
                throw new Error(`Provider ${providerName} is not configured. Missing API key.`);
            }
            const wrappedProvider = {
                async translate(text, sourceLang, targetLang, options = {}) {
                    const priority = text.length < 100 ? 1 : 0;
                    return rateLimiter.enqueue(normalizedProviderName, () => selected.translate(text, sourceLang, targetLang, options), priority);
                },
            };
            if (selected.analyze) {
                wrappedProvider.analyze = (prompt, options = {}) => {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    return rateLimiter.enqueue(normalizedProviderName, () => selected.analyze(prompt, options));
                };
            }
            return wrappedProvider;
        }
        const allProviders = [];
        const availableProviderNames = this.getAvailableProviders();
        if (normalizedProviderName &&
            providers[normalizedProviderName] &&
            availableProviderNames.includes(normalizedProviderName)) {
            allProviders.push({
                name: normalizedProviderName,
                implementation: providers[normalizedProviderName],
            });
        }
        else if (normalizedProviderName) {
            console.warn(`Provider '${providerName}' not found or not configured, using default provider chain`);
        }
        let fallbackOrder = availableProviderNames;
        if (config?.fallbackOrder && Array.isArray(config.fallbackOrder)) {
            fallbackOrder = config.fallbackOrder
                .filter((name) => availableProviderNames.includes(name.toLowerCase()))
                .map((name) => name.toLowerCase());
            const remainingProviders = availableProviderNames.filter((name) => !fallbackOrder.includes(name));
            fallbackOrder = [...fallbackOrder, ...remainingProviders];
        }
        for (const name of fallbackOrder) {
            if (!allProviders.some((p) => p.name === name) && providers[name]) {
                allProviders.push({ name, implementation: providers[name] });
            }
        }
        if (allProviders.length === 0) {
            throw new Error("No valid providers found for fallback chain. Please check your API keys.");
        }
        if (process.env.DEBUG) {
            const safeProviderNames = allProviders.map((p) => p.name // FallbackProvider logic expects name property on wrapped object? No, p is ProviderWrapper {name, implementation}
            );
            console.log(`Provider fallback chain: ${safeProviderNames.join(" → ")}`);
        }
        return new FallbackProvider(allProviders);
    }
    /**
     * Get list of available (configured) providers.
     * @returns {string[]} - Array of provider names with valid API keys.
     */
    static getAvailableProviders() {
        const providers = {
            dashscope: process.env.DASHSCOPE_API_KEY,
            xai: process.env.XAI_API_KEY,
            openai: process.env.OPENAI_API_KEY,
            deepseek: process.env.DEEPSEEK_API_KEY,
            gemini: process.env.GEMINI_API_KEY,
        };
        return Object.entries(providers)
            .filter(([, key]) => !!key)
            .map(([name]) => name);
    }
    /**
     * Validate that at least one provider is configured.
     * @returns {string[]} - Array of available providers.
     * @throws {Error} If no providers are configured.
     */
    static validateProviders() {
        const available = this.getAvailableProviders();
        if (available.length === 0) {
            throw new Error("No API providers configured. Please set at least one API key.");
        }
        return available;
    }
    /**
     * Check if a specific provider is configured.
     * @param {string} providerName - Name of the provider.
     * @returns {boolean} - True if provider has an API key configured.
     */
    static isProviderConfigured(providerName) {
        const envVarMap = {
            dashscope: "DASHSCOPE_API_KEY",
            xai: "XAI_API_KEY",
            openai: "OPENAI_API_KEY",
            deepseek: "DEEPSEEK_API_KEY",
            gemini: "GEMINI_API_KEY",
        };
        const envKey = envVarMap[providerName.toLowerCase()];
        return !!(envKey && process.env[envKey]);
    }
}
export default ProviderFactory;
