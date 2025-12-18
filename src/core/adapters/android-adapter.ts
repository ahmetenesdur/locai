import { FileFormatAdapter } from "./base-adapter.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

/**
 * Adapter for Android XML resources files (strings.xml)
 */
export class AndroidAdapter implements FileFormatAdapter {
	extensions = [".xml"];
	private parser: XMLParser;
	private builder: XMLBuilder;

	constructor() {
		this.parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			textNodeName: "#text",
			isArray: (name) => name === "string" || name === "string-array" || name === "item",
		});
		this.builder = new XMLBuilder({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			textNodeName: "#text",
			format: true,
			indentBy: "    ",
		});
	}

	async parse(content: string): Promise<Record<string, any>> {
		try {
			const parsed = this.parser.parse(content);

			// Extract strings resources
			const resources = parsed.resources || {};
			const result: Record<string, any> = {};

			// Handle regular strings
			if (resources.string) {
				resources.string.forEach((item: any) => {
					const key = item["@_name"];
					const value = item["#text"];
					if (key) {
						result[key] = value || "";
					}
				});
			}

			// Handle string arrays (flattened as array_name.index)
			if (resources["string-array"]) {
				resources["string-array"].forEach((array: any) => {
					const arrayName = array["@_name"];
					if (array.item) {
						array.item.forEach((value: string, index: number) => {
							result[`${arrayName}.${index}`] = value;
						});
					}
				});
			}

			return result;
		} catch (error: any) {
			throw new Error(`Failed to parse Android XML: ${error.message}`);
		}
	}

	async serialize(data: Record<string, any>): Promise<string> {
		const resources: any = {
			string: [],
			"string-array": [],
		};

		// Collect keys to handle arrays properly
		const arrays: Record<string, string[]> = {};
		const strings: Record<string, string> = {};

		for (const [key, value] of Object.entries(data)) {
			if (key.includes(".")) {
				const [arrayName, indexStr] = key.split(".");
				if (!isNaN(Number(indexStr))) {
					if (!arrays[arrayName]) arrays[arrayName] = [];
					arrays[arrayName][Number(indexStr)] = value;
					continue;
				}
			}
			strings[key] = value;
		}

		// Add strings
		for (const [key, value] of Object.entries(strings)) {
			resources.string.push({
				"@_name": key,
				"#text": value,
			});
		}

		// Add arrays
		for (const [key, items] of Object.entries(arrays)) {
			resources["string-array"].push({
				"@_name": key,
				item: items.filter((i) => i !== undefined),
			});
		}

		// Sort by name for consistency
		resources.string.sort((a: any, b: any) => a["@_name"].localeCompare(b["@_name"]));
		resources["string-array"].sort((a: any, b: any) => a["@_name"].localeCompare(b["@_name"]));

		if (resources["string-array"].length === 0) delete resources["string-array"];
		if (resources.string.length === 0) delete resources.string;

		const xmlObj = {
			"?xml": {
				"@_version": "1.0",
				"@_encoding": "utf-8",
			},
			resources: resources,
		};

		return this.builder.build(xmlObj);
	}
}
