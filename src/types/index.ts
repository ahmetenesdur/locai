import { OrchestratorOptions } from "../core/orchestrator.js";
import { ContextConfig } from "../core/context-processor.js";

export interface TranslationOptions extends Omit<OrchestratorOptions, "context"> {
	source: string;
	targets?: string[];
	localesDir?: string;
	debug?: boolean;
	forceUpdate?: boolean;
	syncOptions?: {
		enabled?: boolean;
		removeDeletedKeys?: boolean;
	};
	concurrencyLimit?: number;
	saveReviewQueue?: boolean;
	minConfidence?: number;
	fileExtensions?: string[];
	// Add other implicit options used in code but not originally defined
	progressOptions?: any;
	qualityChecks?: any;
	styleGuide?: any;
	context?: ContextConfig;
	lengthControl?: any;
}

export interface GlobalStats {
	total: number;
	success: number;
	failed: number;
	skipped: number;
	languages: Record<string, any>;
	byCategory: Record<string, number>;
	details: Record<string, { totalConfidence: number; samples: number }>;
	error?: {
		message: string;
		time: string;
		stack?: string;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	orchestrators: any[];
	endTime?: string;
	totalDuration?: number;
	totalTime: number;
	startTime: string;
}

export interface MissingKey {
	key: string;
	text: string;
	targetLang: string;
	existingTranslation?: string;
	isModified: boolean;
	isNew: boolean;
	issueDetails?: any;
}

export interface LanguageProcessResult {
	status: any;
	savedMessage?: string;
	error?: string;
}
