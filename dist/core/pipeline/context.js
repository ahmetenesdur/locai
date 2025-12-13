export const createTranslationContext = (key, sourceText, sourceLang, targetLang, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
options, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
meta = {}, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
existingTranslation = null) => ({
    key,
    sourceText,
    sourceLang,
    targetLang,
    options,
    meta,
    existingTranslation,
    result: {
        key,
        translated: null,
        success: false,
        context: meta,
    },
});
