import { describe, it, expect } from "vitest";
import { JsonAdapter } from "../../../../src/core/adapters/json-adapter";
import { YamlAdapter } from "../../../../src/core/adapters/yaml-adapter";
import { PoAdapter } from "../../../../src/core/adapters/po-adapter";
import { PropertiesAdapter } from "../../../../src/core/adapters/properties-adapter";
import { FormatFactory } from "../../../../src/core/adapters/factory";

describe("FileFormatAdapters", () => {
	describe("JsonAdapter", () => {
		const adapter = new JsonAdapter();

		it("should parse valid JSON", async () => {
			const content = '{"key": "value"}';
			const result = await adapter.parse(content);
			expect(result).toEqual({ key: "value" });
		});

		it("should serialize to JSON", async () => {
			const data = { key: "value" };
			const result = await adapter.serialize(data);
			expect(JSON.parse(result)).toEqual(data);
		});

		it("should support .arb extension", () => {
			expect(adapter.extensions).toContain(".arb");
		});
	});

	describe("YamlAdapter", () => {
		const adapter = new YamlAdapter();

		it("should parse valid YAML", async () => {
			const content = "key: value\nnested:\n  val: 1";
			const result = await adapter.parse(content);
			expect(result).toEqual({ key: "value", nested: { val: 1 } });
		});

		it("should serialize to YAML", async () => {
			const data = { key: "value", list: ["a", "b"] };
			const result = await adapter.serialize(data);
			expect(result).toContain("key: value");
			expect(result).toContain("- a");
		});
	});

	describe("PoAdapter", () => {
		const adapter = new PoAdapter();
		const samplePo = `
msgid ""
msgstr ""
"Content-Type: text/plain; charset=utf-8\\n"

msgid "hello"
msgstr "hola"

msgid "world"
msgstr "mundo"
`;

		it("should parse PO content to flat object", async () => {
			const result = await adapter.parse(samplePo);
			expect(result).toEqual({ hello: "hola", world: "mundo" });
		});

		it("should serialize object to PO format", async () => {
			const data = { hello: "hola" };
			const result = await adapter.serialize(data);
			expect(result).toContain('msgid "hello"');
			expect(result).toContain('msgstr "hola"');
		});
	});

	describe("PropertiesAdapter", () => {
		const adapter = new PropertiesAdapter();

		it("should parse properties content", async () => {
			const content = "key=value\nmultiple\\ words=some text";
			const result = await adapter.parse(content);
			expect(result).toEqual({ key: "value", "multiple words": "some text" });
		});

		it("should serialize to properties format", async () => {
			const data = { key: "value", "a b": "c" };
			const result = await adapter.serialize(data);
			expect(result).toContain("key=value");
			expect(result).toContain("a\\ b=c");
		});
	});

	describe("FormatFactory", () => {
		it("should return JsonAdapter for .json extension", () => {
			const adapter = FormatFactory.getAdapter("test.json");
			expect(adapter).toBeInstanceOf(JsonAdapter);
		});

		it("should return YamlAdapter for .yaml extension", () => {
			const adapter = FormatFactory.getAdapter("test.yaml");
			expect(adapter).toBeInstanceOf(YamlAdapter);
		});

		it("should default to JsonAdapter for unknown extension", () => {
			const adapter = FormatFactory.getAdapter("test.unknown");
			expect(adapter).toBeInstanceOf(JsonAdapter);
		});
	});
});
