import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ReviewCommand from "../../../src/commands/review.js";
import prompts from "prompts";
import fs from "fs";

// Mock prompts module
vi.mock("prompts");
vi.mock("fs");

describe("ReviewCommand", () => {
	let command: ReviewCommand;
	const mockConfig = {
		localesDir: "/locales",
		source: "en",
	};

	beforeEach(() => {
		command = new ReviewCommand(mockConfig);
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("should initialize correctly", () => {
		expect(command).toBeDefined();
	});

	it("should load review queue from file", () => {
		const mockData = JSON.stringify({
			items: [
				{
					key: "test",
					language: "es",
					translation: "Hola",
					source: "Hello",
					confidence: { score: 0.5, level: "low", issues: [] },
				},
			],
		});
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(mockData);

		const success = command.loadReviewQueue();

		expect(success).toBe(true);
		// Access private property for verification
		expect((command as any).reviewQueue).toHaveLength(1);
	});

	it("should return false if review queue file does not exist", () => {
		(fs.existsSync as any).mockReturnValue(false);
		const success = command.loadReviewQueue();
		expect(success).toBe(false);
	});

	it("should handle approve action", async () => {
		// Mock queue loading
		const mockItem = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [mockItem] }));
		(fs.writeFileSync as any).mockImplementation(() => {});

		// Mock prompts response: Approve then exit (implicitly done if loop finishes, but let's just approve)
		// Since startReview loops, we need to handle the prompt.
		// The loop continues until queue is empty or exit is selected.
		// Let's mock prompts to return 'approve' for the first call.
		// But wait, the loop goes distinct items. We have 1 item.
		// After handling action, loop continues.
		// So we need prompt to return 'approve'. Code will process it. Loop ends because i < length.

		(prompts as unknown as any).mockResolvedValueOnce({ action: "approve" });

		await command.startReview();

		// Check decisions
		expect((command as any).decisions.accepted).toHaveLength(1);
		expect((command as any).decisions.accepted[0].key).toBe("test");
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("review-decisions.json"),
			expect.any(String)
		);
	});

	it("should handle edit action", async () => {
		const mockItem = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [mockItem] }));
		(fs.writeFileSync as any).mockImplementation(() => {});

		// Mock prompts:
		// 1. Action -> 'edit'
		// 2. New Translation -> 'Hola Edited'
		(prompts as unknown as any)
			.mockResolvedValueOnce({ action: "edit" })
			.mockResolvedValueOnce({ newTranslation: "Hola Edited" });

		await command.startReview();

		expect((command as any).decisions.edited).toHaveLength(1);
		expect((command as any).decisions.edited[0].translation).toBe("Hola Edited");
	});

	it("should handle skip action", async () => {
		const mockItem = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [mockItem] }));
		(fs.writeFileSync as any).mockImplementation(() => {});

		(prompts as unknown as any).mockResolvedValueOnce({ action: "skip" });

		await command.startReview();

		expect((command as any).decisions.skipped).toHaveLength(1);
	});

	it("should exit when exit action selected", async () => {
		const mockItem = {
			key: "test",
			language: "es",
			source: "Hello",
			translation: "Hola",
			confidence: { score: 0.5, level: "low", issues: [] },
		};
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [mockItem] }));
		(fs.writeFileSync as any).mockImplementation(() => {});

		(prompts as unknown as any).mockResolvedValueOnce({ action: "exit" });

		await command.startReview();

		// Decisions should be empty (or whatever state was before exit)
		expect((command as any).decisions.accepted).toHaveLength(0);
		// Should still save decisions on exit
		expect(fs.writeFileSync).toHaveBeenCalled();
	});

	it("should export review queue", () => {
		(fs.existsSync as any).mockReturnValue(true);
		(fs.readFileSync as any).mockReturnValue(JSON.stringify({ items: [] }));
		(fs.writeFileSync as any).mockImplementation(() => {});

		// Manually populate queue
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
});
