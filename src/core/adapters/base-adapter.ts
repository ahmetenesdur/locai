import type { TranslationObject } from "../../utils/object-transformer.js";

/**
 * Options accepted by {@link FileFormatAdapter.serialize}.
 * Adapters ignore options that do not apply to their format.
 */
export interface SerializeOptions {
	/** Indentation width (JSON, YAML) */
	indent?: number;
	/** Request compact output where the format supports it */
	compact?: boolean;
}

/**
 * Interface for file format adapters
 */
export interface FileFormatAdapter {
	/**
	 * File extensions supported by this adapter (including dot, e.g. ".json")
	 */
	extensions: string[];

	/**
	 * Parse file content into a key-value object
	 * @param content - Raw string content
	 */
	parse(content: string): Promise<TranslationObject>;

	/**
	 * Serialize data object into string format
	 * @param data - Key-value object
	 * @param options - Serialization options
	 */
	serialize(data: TranslationObject, options?: SerializeOptions): Promise<string>;
}
