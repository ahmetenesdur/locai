/**
 * Prompt template utilities for translation and analysis
 */
const getLengthInstructions = (options) => {
    if (!options || typeof options !== "object") {
        console.warn("Invalid options provided to getLengthInstructions, using defaults");
        options = {};
    }
    const { mode = "smart", lengthControl, targetLang, detectedContext } = options;
    if (!targetLang || typeof targetLang !== "string") {
        // Just return basic length instructions without failing
        return "TRANSLATION LENGTH: Keep translation concise and natural.";
    }
    const context = detectedContext?.category || "general";
    if (mode === "smart" && lengthControl?.rules?.smart) {
        const langRules = lengthControl.rules.smart.byLanguage?.[targetLang] || {};
        const contextRules = lengthControl.rules.smart.byContext?.[context] || {};
        const langMax = typeof langRules.max === "number" ? langRules.max : 0.15;
        const contextMax = typeof contextRules.max === "number" ? contextRules.max : 0.15;
        return `TRANSLATION LENGTH REQUIREMENTS [${targetLang}]:
1. Maximum allowed length: ${Math.round(langMax * 100)}% longer than source
2. Context-specific [${context}] limit: ${Math.round(contextMax * 100)}% longer than source
3. Shorter translations are preferred when possible
4. Maintain semantic completeness while being concise`;
    }
    const templates = {
        strict: () => {
            const strictLimit = lengthControl?.rules?.strict;
            const limit = typeof strictLimit === "number" ? strictLimit : 1.0;
            return `CRITICAL: Translation must not exceed ${Math.round(limit * 100)}% of source length. Prefer shorter translations.`;
        },
        flexible: () => {
            const flexibleLimit = lengthControl?.rules?.flexible;
            const limit = typeof flexibleLimit === "number" ? flexibleLimit : 1.2;
            return `IMPORTANT: Keep translation concise. Target length should not exceed source length by more than ${Math.round(limit * 100)}%.`;
        },
        exact: () => {
            const exactLimit = lengthControl?.rules?.exact;
            const limit = typeof exactLimit === "number" ? exactLimit : 1.05;
            return `STRICT: Translation must closely match source length (max ${Math.round(limit * 100)}% deviation).`;
        },
        relaxed: () => {
            const relaxedLimit = lengthControl?.rules?.relaxed;
            const limit = typeof relaxedLimit === "number" ? relaxedLimit : 1.5;
            return `GUIDELINE: Translation should be concise but can be up to ${Math.round(limit * 100)}% longer if needed.`;
        },
    };
    const templateFn = templates[mode];
    if (typeof templateFn === "function") {
        try {
            return templateFn();
        }
        catch (error) {
            console.warn(`Error generating length template for mode ${mode}:`, error.message);
        }
    }
    return "TRANSLATION LENGTH: Keep translation concise and natural.";
};
/**
 * Base translation prompt template
 */
const baseTranslationPromptTemplate = (sourceLang, targetLang, text, options = {}) => {
    if (!sourceLang || typeof sourceLang !== "string") {
        console.warn("Invalid sourceLang provided to baseTranslationPromptTemplate");
        sourceLang = "en";
    }
    if (!targetLang || typeof targetLang !== "string") {
        console.warn("Invalid targetLang provided to baseTranslationPromptTemplate");
        targetLang = "es";
    }
    if (typeof text !== "string") {
        console.warn("Invalid text provided to baseTranslationPromptTemplate");
        text = "";
    }
    if (!options || typeof options !== "object") {
        console.warn("Invalid options provided to baseTranslationPromptTemplate, using defaults");
        options = {};
    }
    const context = options.detectedContext && typeof options.detectedContext === "object"
        ? options.detectedContext
        : {
            category: "general",
            confidence: 1.0,
            prompt: "Provide a natural translation",
        };
    const safeContext = {
        category: context.category || "general",
        confidence: typeof context.confidence === "number" ? context.confidence : 1.0,
        prompt: context.prompt || "Provide a natural translation",
        existingTranslation: context.existingTranslation,
    };
    const lengthInstructions = getLengthInstructions({
        ...options,
        targetLang: targetLang, // Pass targetLang explicitly
        detectedContext: safeContext, // Also pass context
    });
    let additionalInstructions = "";
    if (safeContext.existingTranslation && typeof safeContext.existingTranslation === "string") {
        const truncatedTranslation = safeContext.existingTranslation.length > 200
            ? safeContext.existingTranslation.substring(0, 200) + "..."
            : safeContext.existingTranslation;
        additionalInstructions = `\nREVISION REQUEST: The existing translation "${truncatedTranslation}" has length issues. Please provide a corrected version that matches the source text length requirements.`;
    }
    const formality = options.styleGuide?.formality || "neutral";
    const toneOfVoice = options.styleGuide?.toneOfVoice || "professional";
    return `
Translation Task: ${sourceLang} → ${targetLang}
${additionalInstructions}

Category: ${safeContext.category}
Context Instructions: ${safeContext.prompt}

LENGTH CONTROL:
${lengthInstructions}

STRICT OUTPUT REQUIREMENTS:
1. RETURN ONLY THE TRANSLATED TEXT
2. NO EXPLANATIONS OR COMMENTARY
3. NO <think> BLOCKS OR MARKDOWN
4. NO QUOTES OR FORMATTING
5. PRESERVE ALL PLACEHOLDERS EXACTLY AS THEY APPEAR

CRITICAL PLACEHOLDER RULES:
- Keep ALL placeholders like {message}, {name}, {value} EXACTLY as they appear in the source
- DO NOT translate placeholder names: {message} must stay {message}, NOT {mesaj} or {mensaje}
- DO NOT add content around placeholders: {message} must NOT become {mesaj}{message} or Bạn{message}
- DO NOT modify the curly braces: { and } must remain unchanged
- Placeholders are variables that will be replaced with dynamic content later
- Only translate the text AROUND the placeholders, never the placeholders themselves

Style: ${formality}, ${toneOfVoice}

Text to Translate:
${text}`;
};
/**
 * Base analysis prompt template
 */
const baseAnalysisPromptTemplate = (text, options = {}) => {
    if (typeof text !== "string") {
        console.warn("Invalid text provided to baseAnalysisPromptTemplate");
        text = "";
    }
    if (!options || typeof options !== "object") {
        console.warn("Invalid options provided to baseAnalysisPromptTemplate, using defaults");
        options = {};
    }
    let categories = "technical, marketing, legal, defi, ui, general";
    if (options.categories && typeof options.categories === "object") {
        try {
            const categoryKeys = Object.keys(options.categories);
            if (Array.isArray(categoryKeys) && categoryKeys.length > 0) {
                categories = categoryKeys.join(", ");
            }
        }
        catch (error) {
            console.warn("Error processing categories:", error.message);
        }
    }
    const maxTextLength = 1500;
    const truncatedText = text.length > maxTextLength ? text.substring(0, maxTextLength) + "..." : text;
    const allowNewCategories = options.allowNewCategories === true;
    const categoryNote = allowNewCategories
        ? ", or suggest a new category if none of these fit"
        : "";
    return `
TASK: Analyze the following text and determine its context category.

TEXT TO ANALYZE:
"""
${truncatedText}
"""

AVAILABLE CATEGORIES: ${categories}${categoryNote}

INSTRUCTIONS:
1. Identify the primary context category of the text
2. Provide a confidence score (0.0-1.0)
3. Suggest 3-5 keywords that are relevant to this text
4. Provide a brief explanation of your categorization

FORMAT YOUR RESPONSE AS JSON:
{
  "category": "category_name",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "explanation": "Brief explanation of why this category was chosen"
}
`;
};
// Provider-specific templates for translation
const translationPrompts = {
    gemini: (sourceLang, targetLang, text, options) => ({
        contents: [
            {
                parts: [
                    {
                        text: `${baseTranslationPromptTemplate(sourceLang, targetLang, text, options)}
Original Text: "${text}"`,
                    },
                ],
            },
        ],
    }),
    openai: (sourceLang, targetLang, text, options) => ({
        messages: [
            {
                role: "system",
                content: baseTranslationPromptTemplate(sourceLang, targetLang, text, options),
            },
            {
                role: "user",
                content: text,
            },
        ],
    }),
    dashscope: (sourceLang, targetLang, text, options) => ({
        messages: [
            {
                role: "system",
                content: baseTranslationPromptTemplate(sourceLang, targetLang, text, options),
            },
            {
                role: "user",
                content: text,
            },
        ],
    }),
    deepseek: (sourceLang, targetLang, text, options) => ({
        messages: [
            {
                role: "system",
                content: baseTranslationPromptTemplate(sourceLang, targetLang, text, options),
            },
            {
                role: "user",
                content: text,
            },
        ],
    }),
    xai: (sourceLang, targetLang, text, options) => ({
        messages: [
            {
                role: "system",
                content: baseTranslationPromptTemplate(sourceLang, targetLang, text, options),
            },
            {
                role: "user",
                content: text,
            },
        ],
    }),
    default: (sourceLang, targetLang, text, options) => ({
        messages: [
            {
                role: "system",
                content: baseTranslationPromptTemplate(sourceLang, targetLang, text, options),
            },
            {
                role: "user",
                content: text,
            },
        ],
    }),
};
// Provider-specific templates for analysis
const analysisPrompts = {
    gemini: (text, options) => ({
        contents: [
            {
                parts: [
                    {
                        text: baseAnalysisPromptTemplate(text, options),
                    },
                ],
            },
        ],
    }),
    openai: (text, options) => ({
        messages: [
            {
                role: "system",
                content: "You are a context analysis assistant that helps identify the category and context of text.",
            },
            {
                role: "user",
                content: baseAnalysisPromptTemplate(text, options),
            },
        ],
    }),
    dashscope: (text, options) => ({
        model: options.model || "qwen-plus",
        input: {
            messages: [
                {
                    role: "system",
                    content: "You are a context analysis assistant that helps identify the category and context of text.",
                },
                {
                    role: "user",
                    content: baseAnalysisPromptTemplate(text, options),
                },
            ],
        },
        parameters: {
            temperature: options.temperature || 0.2,
            max_tokens: options.maxTokens || 1000,
        },
    }),
    deepseek: (text, options) => ({
        messages: [
            {
                role: "system",
                content: "You are a context analysis assistant that helps identify the category and context of text.",
            },
            {
                role: "user",
                content: baseAnalysisPromptTemplate(text, options),
            },
        ],
    }),
    xai: (text, options) => ({
        messages: [
            {
                role: "system",
                content: "You are a context analysis assistant that helps identify the category and context of text.",
            },
            {
                role: "user",
                content: baseAnalysisPromptTemplate(text, options),
            },
        ],
    }),
    default: (text, options) => ({
        messages: [
            {
                role: "system",
                content: "You are a context analysis assistant that helps identify the category and context of text.",
            },
            {
                role: "user",
                content: baseAnalysisPromptTemplate(text, options),
            },
        ],
    }),
};
/**
 * Get translation prompt
 */
const getPrompt = (provider, sourceLang, targetLang, text, options = {}) => {
    if (!provider || typeof provider !== "string") {
        console.warn("Invalid provider provided to getPrompt, using default");
        provider = "default";
    }
    if (!sourceLang || typeof sourceLang !== "string") {
        console.warn("Invalid sourceLang provided to getPrompt, using en");
        sourceLang = "en";
    }
    if (!targetLang || typeof targetLang !== "string") {
        console.warn("Invalid targetLang provided to getPrompt, using es");
        targetLang = "es";
    }
    if (typeof text !== "string") {
        console.warn("Invalid text provided to getPrompt, using empty string");
        text = "";
    }
    if (!options || typeof options !== "object") {
        console.warn("Invalid options provided to getPrompt, using defaults");
        options = {};
    }
    const promptGenerator = translationPrompts[provider] || translationPrompts.default;
    try {
        return promptGenerator(sourceLang, targetLang, text, options);
    }
    catch (error) {
        console.error(`Error generating prompt for provider ${provider}:`, error.message);
        return translationPrompts.default(sourceLang, targetLang, text, options);
    }
};
/**
 * Get analysis prompt
 */
const getAnalysisPrompt = (provider, text, options = {}) => {
    if (!provider || typeof provider !== "string") {
        console.warn("Invalid provider provided to getAnalysisPrompt, using default");
        provider = "default";
    }
    if (typeof text !== "string") {
        console.warn("Invalid text provided to getAnalysisPrompt, using empty string");
        text = "";
    }
    if (!options || typeof options !== "object") {
        console.warn("Invalid options provided to getAnalysisPrompt, using defaults");
        options = {};
    }
    const promptGenerator = analysisPrompts[provider] || analysisPrompts.default;
    try {
        return promptGenerator(text, options);
    }
    catch (error) {
        console.error(`Error generating analysis prompt for provider ${provider}:`, error.message);
        return analysisPrompts.default(text, options);
    }
};
export { getPrompt, getAnalysisPrompt };
