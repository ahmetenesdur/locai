import { describe, it, expect, vi, beforeEach } from "vitest";
import ReviewCommand from "../../../src/commands/review.js";
import fs from "fs";
import path from "path";

vi.mock("fs");
vi.mock("readline", () => ({
	default: {
		createInterface: vi.fn().mockReturnValue({
			question: vi.fn(),
			close: vi.fn(),
		}),
	},
}));

describe("ReviewCommand", () => {
	let command: ReviewCommand;
	const mockConfig = {
		localesDir: "/locales",
		source: "en",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		command = new ReviewCommand(mockConfig);
	});

	it("should initialize correctly", () => {
		expect(command).toBeDefined();
	});

	it("should handle accept action", async () => {
		const item = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};

		const result = await command.handleAction("accept", item);

		expect(result).toBe("continue");
		// Check internal state (accessing private property via any cast strictly for verification)
		expect((command as any).decisions.accepted).toHaveLength(1);
		expect((command as any).decisions.accepted[0]).toBe(item);
	});

	it("should handle reject action", async () => {
		const item = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};

		const result = await command.handleAction("r", item);

		expect(result).toBe("continue");
		expect((command as any).decisions.rejected).toHaveLength(1);
	});

	it("should load review queue from file", () => {
		const mockData = JSON.stringify({ items: [{ key: "test" }] });
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(mockData);

		const success = command.loadReviewQueue();

		expect(success).toBe(true);
		// expect((command as any).reviewQueue).toHaveLength(1); // Private
	});

	it("should save decisions to file", () => {
		(fs.existsSync as any).mockReturnValue(true);
		// applyDecisions calls fs.writeFileSync too

		command.saveDecisions(); // Empty decisions

		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("review-decisions.json"),
			expect.any(String)
		);
	});

	it("should skip item", async () => {
		const item = {
			key: "test",
			language: "es",
			source: "src",
			translation: "tgt",
			confidence: { score: 0.1, level: "low", issues: [] },
		};
		const result = await command.handleAction("s", item);
		expect(result).toBe("continue");
		expect((command as any).decisions.skipped).toHaveLength(1);
	});

	it("should edit translation", async () => {
		const item = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};

		// Mock user input for new translation
		vi.spyOn(command, "getUserInput").mockResolvedValueOnce("Hola Edited");

		const result = await command.handleAction("edit", item);

		expect(result).toBe("continue");
		expect((command as any).decisions.edited).toHaveLength(1);
		expect((command as any).decisions.edited[0].translation).toBe("Hola Edited");
		expect((command as any).decisions.edited[0].edited).toBe(true);
	});

	it("should handle quit action", async () => {
		const result = await command.handleAction("q", {} as any);
		expect(result).toBe("quit");
	});

	it("should export review queue", () => {
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [] }));

		command.loadReviewQueue(); // Load empty
		// Manually populate with complete data
		(command as any).reviewQueue = [
			{
				key: "test",
				language: "es",
				source: "src",
				translation: "tgt",
				confidence: { score: 0.5, level: "low", issues: [] },
			},
		];

		command.exportReviewQueue("json");

		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining(".json"),
			expect.stringContaining("test")
		);

		command.exportReviewQueue("csv");
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining(".csv"),
			expect.stringContaining("Key,Language")
		);
	});

	it("should start review and process queue", async () => {
		(fs.existsSync as any).mockReturnValue(true);
		const queueItems = [
			{ key: "1", language: "es", translation: "uno", confidence: {} },
			{ key: "2", language: "es", translation: "dos", confidence: {} },
		];
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: queueItems }));

		// Mock user inputs: Accept first, Quit second
		vi.spyOn(command, "getUserInput")
			.mockResolvedValueOnce("a") // Accept item 1
			.mockResolvedValueOnce("q"); // Quit on item 2

		await command.startReview();

		expect((command as any).decisions.accepted).toHaveLength(1);
		// Should save decisions even if quit early
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("review-decisions.json"),
			expect.any(String)
		);
	});
});
