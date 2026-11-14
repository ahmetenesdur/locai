import type { TranslationObject, TranslationValue } from "../../utils/object-transformer.js";
import { FileFormatAdapter } from "./base-adapter.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

/** Text content as produced by fast-xml-parser (numeric/boolean text is coerced) */
type XmlText = string | number | boolean;

/** `<string name="...">text</string>` as parsed with the options below */
interface ParsedStringNode {
	"@_name"?: string;
	"#text"?: XmlText;
}

/** `<string-array name="..."><item>text</item></string-array>` as parsed */
interface ParsedStringArrayNode {
	"@_name"?: string;
	item?: XmlText[];
}

/** Shape of a parsed strings.xml document (`string`, `string-array` and `item` are always arrays) */
interface ParsedAndroidDocument {
	/** An empty `<resources/>` element parses to "" */
	resources?:
		| ""
		| {
				string?: ParsedStringNode[];
				"string-array"?: ParsedStringArrayNode[];
		  };
}

interface StringNode {
	"@_name": string;
	"#text": TranslationValue;
}

interface StringArrayNode {
	"@_name": string;
	item: TranslationValue[];
}

interface AndroidResources {
	string?: StringNode[];
	"string-array"?: StringArrayNode[];
}

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

	async parse(content: string): Promise<TranslationObject> {
		try {
			const parsed = this.parser.parse(content) as ParsedAndroidDocument;

			// Extract strings resources
			const resources = parsed.resources || {};
			const result: TranslationObject = {};

			// Handle regular strings
			if (resources.string) {
				resources.string.forEach((item) => {
					const key = item["@_name"];
					const value = item["#text"];
					if (key) {
						result[key] = value || "";
					}
				});
			}

			// Handle string arrays (flattened as array_name.index)
			if (resources["string-array"]) {
				resources["string-array"].forEach((array) => {
					const arrayName = array["@_name"];
					if (array.item) {
						array.item.forEach((value, index) => {
							result[`${arrayName}.${index}`] = value;
						});
					}
				});
			}

			return result;
		} catch (error) {
			throw new Error(
				`Failed to parse Android XML: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async serialize(data: TranslationObject): Promise<string> {
		const stringNodes: StringNode[] = [];
		const stringArrayNodes: StringArrayNode[] = [];

		// Collect keys to handle arrays properly
		const arrays: Record<string, TranslationValue[]> = {};
		const strings: Record<string, TranslationValue> = {};

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
			stringNodes.push({
				"@_name": key,
				"#text": value,
			});
		}

		// Add arrays
		for (const [key, items] of Object.entries(arrays)) {
			stringArrayNodes.push({
				"@_name": key,
				item: items.filter((i) => i !== undefined),
			});
		}

		// Sort by name for consistency
		stringNodes.sort((a, b) => a["@_name"].localeCompare(b["@_name"]));
		stringArrayNodes.sort((a, b) => a["@_name"].localeCompare(b["@_name"]));

		const resources: AndroidResources = {};
		if (stringNodes.length > 0) resources.string = stringNodes;
		if (stringArrayNodes.length > 0) resources["string-array"] = stringArrayNodes;

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
