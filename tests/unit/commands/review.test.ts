import { describe, it, expect, vi, beforeEach } from "vitest";
import ReviewCommand, { ReviewDecisions, ReviewItem } from "../../../src/commands/review.js";
import prompts from "prompts";
import fs from "fs";

// Mock prompts module
vi.mock("prompts");
vi.mock("fs");

const mockItem: ReviewItem = {
	key: "test",
	language: "es",
	source: "Hello",
	translation: "Hola",
	confidence: { score: 0.5, level: "low", issues: [] },
};

/** Make the mocked fs serve `items` as the review queue file and swallow writes. */
const mockReviewQueue = (items: ReviewItem[]) => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ items }));
	vi.mocked(fs.writeFileSync).mockImplementation(() => {});
};

/** Content written to the first file whose path contains `fileName`. */
const writtenContent = (fileName: string): string => {
	const call = vi
		.mocked(fs.writeFileSync)
		.mock.calls.find(([file]) => String(file).includes(fileName));
	expect(call).toBeDefined();
	return String(call?.[1]);
};

/** Decisions persisted to `.localize-cache/review-decisions.json` by saveDecisions(). */
const savedDecisions = (): ReviewDecisions => {
	const saved: { decisions: ReviewDecisions } = JSON.parse(
		writtenContent("review-decisions.json")
	);
	return saved.decisions;
};

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
		mockReviewQueue([mockItem]);

		const success = command.loadReviewQueue();

		expect(success).toBe(true);
		// The loaded queue is what gets exported
		command.exportReviewQueue("json");
		expect(JSON.parse(writtenContent(".json"))).toHaveLength(1);
	});

	it("should return false if review queue file does not exist", () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const success = command.loadReviewQueue();
		expect(success).toBe(false);
	});

	it("should handle approve action", async () => {
		mockReviewQueue([mockItem]);
		// One queued item: the loop prompts once, then ends
		vi.mocked(prompts).mockResolvedValueOnce({ action: "approve" });

		await command.startReview();

		const decisions = savedDecisions();
		expect(decisions.accepted).toHaveLength(1);
		expect(decisions.accepted[0].key).toBe("test");
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("review-decisions.json"),
			expect.any(String)
		);
	});

	it("should handle edit action", async () => {
		mockReviewQueue([mockItem]);
		// 1. Action -> 'edit'
		// 2. New Translation -> 'Hola Edited'
		vi.mocked(prompts)
			.mockResolvedValueOnce({ action: "edit" })
			.mockResolvedValueOnce({ newTranslation: "Hola Edited" });

		await command.startReview();

		const decisions = savedDecisions();
		expect(decisions.edited).toHaveLength(1);
		expect(decisions.edited[0].translation).toBe("Hola Edited");
	});

	it("should handle skip action", async () => {
		mockReviewQueue([mockItem]);
		vi.mocked(prompts).mockResolvedValueOnce({ action: "skip" });

		await command.startReview();

		expect(savedDecisions().skipped).toHaveLength(1);
	});

	it("should exit when exit action selected", async () => {
		mockReviewQueue([mockItem]);
		vi.mocked(prompts).mockResolvedValueOnce({ action: "exit" });

		await command.startReview();

		// Decisions should be empty, but still saved on exit
		expect(savedDecisions().accepted).toHaveLength(0);
	});

	it("should export review queue", () => {
		mockReviewQueue([{ ...mockItem, source: "src", translation: "tgt" }]);

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
