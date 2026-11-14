import type { CodeContext } from "../../types/context.js";
import type { AnalysisResult } from "../context-processor.js";
import type { OrchestratorOptions } from "../orchestrator.js";
import type { ConfidenceResult } from "../../utils/confidence-scorer.js";
import type { ProtectedTerm } from "../../utils/glossary-manager.js";
import type { FlatTranslationValue } from "../../utils/object-transformer.js";
import type { FixResult, QualityIssue } from "../../utils/quality/base-checker.js";

/** A stored translation of similar source text, found in vector memory. */
export interface SimilarTranslation {
	source: string;
	target: string;
	similarity: number;
}

/**
 * What is known about the text being translated: its detected category (see
 * ContextProcessor) plus what the pipeline steps add. Forwarded to the provider as
 * `detectedContext` and returned as the result's `context`.
 */
export interface TranslationMeta extends Partial<AnalysisResult> {
	/** Where the key is used in the project's source code (ContextEnrichmentStep). */
	code?: CodeContext;
	/** Embedding of the source text, computed by VectorCacheReadStep and reused by VectorCacheWriteStep. */
	embedding?: number[];
	/** Close vector-memory match, offered to the provider as a reference translation. */
	similarTranslation?: SimilarTranslation;
	/** Set on results served directly from vector memory. */
	matchType?: "vector-exact";
	similarity?: number;
}

/** Tone mismatch reported by ToneCheckStep. */
export interface ToneIssue {
	type: "tone_mismatch";
	message: string;
	severity: "warning";
	suggestion?: string;
	score: number;
}

/** Quality findings of a translation: the quality checker's fix result and any tone issues. */
export interface QualityReport extends Partial<Omit<FixResult, "issues">> {
	issues: (QualityIssue | ToneIssue)[];
}

export interface TranslationResult {
	key: string;
	translated: string | null;
	success: boolean;
	context: TranslationMeta;
	error?: string;
	fromCache?: boolean;
	qualityChecks?: QualityReport;
	/** Set on results served directly from vector memory. */
	meta?: {
		vectorMatch: boolean;
		similarity: number;
	};

	// Set by ConfidenceCheckStep when confidence scoring ran
	confidence?: ConfidenceResult;
	autoApproved?: boolean;
	rejected?: boolean;
	rejectionReason?: string;
	needsReview?: boolean;
}

/** Options visible to the pipeline steps: the orchestrator options plus per-run flags. */
export interface PipelineOptions extends OrchestratorOptions {
	/** Bypass the cache reads, forcing a fresh translation (background cache refresh). */
	skipCache?: boolean;
}

/** Source-code usage of a key, as added by ContextEnrichmentStep. */
export interface VisualContext {
	component?: string;
	file: string;
	comments?: string[];
	props?: Record<string, string>;
	snippet?: string;
}

/** State shared by the pipeline steps while one key is translated. */
export interface TranslationContext {
	key: string;
	sourceText: string;
	sourceLang: string;
	targetLang: string;
	options: PipelineOptions;
	meta: TranslationMeta;
	/** Current value of the key in the target file, or null when there is none. */
	existingTranslation: FlatTranslationValue;
	result: TranslationResult;

	/** Cache key computed by CacheReadStep, used by CacheWriteStep. */
	cacheKey?: string;
	/** Source text with glossary terms replaced by placeholder tokens (GlossaryPreStep). */
	protectedText?: string;
	/** Placeholder token → protected glossary term, used by GlossaryPostStep. */
	termMap?: Map<string, ProtectedTerm>;
	translatedText?: string;
	/** Confidence score of the translation, when the provider supports scoring. */
	confidence?: ConfidenceResult;
	qualityResult?: QualityReport;
	/** Extra prompt context; ContextEnrichmentStep adds the key's source-code usage. */
	contextData?: {
		visualContext?: VisualContext;
	};
}

export const createTranslationContext = (
	key: string,
	sourceText: string,
	sourceLang: string,
	targetLang: string,
	options: PipelineOptions,
	meta: TranslationMeta = {},
	existingTranslation: FlatTranslationValue = null
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
