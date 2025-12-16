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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parse(content: string): Promise<Record<string, any>>;

	/**
	 * Serialize data object into string format
	 * @param data - Key-value object
	 * @param options - Serialization options
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	serialize(data: Record<string, any>, options?: any): Promise<string>;
}
