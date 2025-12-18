import { describe, it, expect } from "vitest";
import { IosAdapter } from "../../../../src/core/adapters/ios-adapter";

describe("IosAdapter", () => {
	const adapter = new IosAdapter();

	it("should parse valid .strings file", async () => {
		const content = `
			/* Welcome message */
			"welcome_message" = "Welcome to LocAI";
			"button_ok" = "OK";
		`;
		const result = await adapter.parse(content);
		expect(result).toEqual({
			welcome_message: "Welcome to LocAI",
			button_ok: "OK",
		});
	});

	it("should handle escaped quotes", async () => {
		const content = `"alert_text" = "Say \\"Hello\\"";`;
		const result = await adapter.parse(content);
		expect(result).toEqual({
			alert_text: 'Say "Hello"',
		});
	});

	it("should serialize object to .strings format", async () => {
		const data = {
			welcome: "Welcome",
			quote: 'Say "Hi"',
		};
		const output = await adapter.serialize(data);

		expect(output).toContain('"welcome" = "Welcome";');
		expect(output).toContain('"quote" = "Say \\"Hi\\"";');
	});
});
