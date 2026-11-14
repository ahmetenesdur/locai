import type { OrchestratorOptions } from "../core/orchestrator.js";
import type { FlatTranslationValue } from "../utils/object-transformer.js";
import type { ProgressStatus } from "../utils/progress-tracker.js";
import type { QualityIssue } from "../utils/quality/base-checker.js";
import type { StateOptions } from "../utils/state-manager.js";
import type {
	GlobalStats as CollectedStats,
	LanguageStats as LanguageCounters,
} from "../utils/statistics-manager.js";

/** The `syncOptions` configuration section: keeping target files in sync with the source. */
export interface SyncOptions {
	enabled?: boolean;
	removeDeletedKeys?: boolean;
	retranslateModified?: boolean;
	stateTracking?: StateOptions;
}

/** Options of a translate or fix run: the orchestrator options plus file and sync settings. */
export interface TranslationOptions extends OrchestratorOptions {
	targets?: string[];
	localesDir?: string;
	debug?: boolean;
	forceUpdate?: boolean;
	syncOptions?: SyncOptions;
	fileExtensions?: string[];
}

/** Per-language counters, plus the error message when the language failed as a whole. */
export interface LanguageStats extends LanguageCounters {
	error?: string;
}

/** Statistics of a translate run, completed by the translation service. */
export interface GlobalStats extends CollectedStats {
	languages: Record<string, LanguageStats>;
	error?: {
		message: string;
		time: string;
		stack?: string;
	};
	endTime?: string;
	totalDuration?: number;
}

/** A source key that needs translating (or re-translating) into one target language. */
export interface MissingKey {
	key: string;
	text: string;
	targetLang: string;
	/** Current value of the key in the target file, if any. */
	existingTranslation?: FlatTranslationValue;
	isModified: boolean;
	isNew: boolean;
	/** The quality issue that requires the existing translation to be redone. */
	issueDetails?: QualityIssue;
}

/** Outcome of translating one target language. */
export interface LanguageProcessResult {
	/** Final progress counters; null when the language failed. */
	status: Pick<ProgressStatus, "completed" | "total" | "language"> | null;
	savedMessage?: string;
	error?: string;
}
