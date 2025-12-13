export interface TranslationResult {
	key: string;
	translated: string | null;
	success: boolean;
	context: Record<string, any>;
	error?: string;
	fromCache?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	qualityChecks?: any;
}

export interface TranslationContext {
	key: string;
	sourceText: string;
	sourceLang: string;
	targetLang: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	meta: Record<string, any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	existingTranslation: any;
	result: TranslationResult;

	protectedText?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	termMap?: Map<string, any>;
	translatedText?: string;
	success?: boolean;
	error?: string;
	fromCache?: boolean;
	qualityChecks?: any;

	// Start with dynamic indexing allowed for flexibility during migration
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

export const createTranslationContext = (
	key: string,
	sourceText: string,
	sourceLang: string,
	targetLang: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	meta: Record<string, any> = {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	existingTranslation: any = null
): TranslationContext => ({
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
