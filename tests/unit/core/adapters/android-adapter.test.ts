import { describe, it, expect } from "vitest";
import { AndroidAdapter } from "../../../../src/core/adapters/android-adapter";

describe("AndroidAdapter", () => {
	const adapter = new AndroidAdapter();

	it("should parse valid strings.xml", async () => {
		const xml = `
			<resources>
				<string name="app_name">LocAI</string>
				<string name="welcome">Welcome</string>
			</resources>
		`;
		const result = await adapter.parse(xml);
		expect(result).toEqual({
			app_name: "LocAI",
			welcome: "Welcome",
		});
	});

	it("should parse string arrays as flattened keys", async () => {
		const xml = `
			<resources>
				<string-array name="colors">
					<item>Red</item>
					<item>Blue</item>
				</string-array>
			</resources>
		`;
		const result = await adapter.parse(xml);
		expect(result).toEqual({
			"colors.0": "Red",
			"colors.1": "Blue",
		});
	});

	it("should serialize object to valid XML", async () => {
		const data = {
			app_name: "LocAI",
			"colors.0": "Red",
		};
		const xml = await adapter.serialize(data);

		expect(xml).toContain('<string name="app_name">LocAI</string>');
		expect(xml).toContain('<string-array name="colors">');
		expect(xml).toContain("<item>Red</item>");
	});
});
