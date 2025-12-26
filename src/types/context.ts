export interface CodeContext {
	filePath: string;
	line: number;
	component?: string;
	usageSnippet?: string;
	comments?: string[];
	props?: Record<string, string>;
}

export interface SourceAnalyzerConfig {
	enabled?: boolean;
	include?: string[];
	exclude?: string[];
}
