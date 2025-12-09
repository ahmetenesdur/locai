import crypto from "crypto";
import AIContextAnalyzer from "../utils/ai-context-analyzer.js";
import { LRUCache } from "lru-cache";
import { log } from "../utils/logger.js";

/**
 * Handles context analysis for translation keys.
 * Uses keyword matching and optional AI analysis to determine the best context category.
 */
class ContextProcessor {
	/**
	 * Create a new ContextProcessor instance.
	 * @param {Object} config - Configuration object.
	 */
	constructor(config) {
		this.config = config;
		this.keywordCache = new Map();
		this.aiAnalyzer = new AIContextAnalyzer(config);

		// Use analysisOptions.cacheAnalysis setting, default true
		const enableCache = config.analysisOptions?.cacheAnalysis !== false;

		this.resultCache = enableCache
			? new LRUCache({
					max: 1000,
					ttl: 1000 * 60 * 60 * 24,
				})
			: null;

		this.initializeKeywords();
	}

	/**
	 * Initialize keyword matching patterns from configuration.
	 */
	initializeKeywords() {
		for (const [category, config] of Object.entries(this.config.categories)) {
			const pattern = config.keywords
				.map((keyword) => keyword.toLowerCase())
				.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
				.join("|");

			this.keywordCache.set(category, {
				regex: new RegExp(`\\b(${pattern})\\b`, "gi"),
				weight: config.weight || 1.0,
				prompt: config.prompt,
			});
		}
	}

	/**
	 * Perform context analysis on a batch of texts.
	 * @param {string[]} texts - Array of texts to analyze.
	 * @returns {Promise<Object[]>} - Array of context analysis results.
	 */
	async analyzeBatch(texts) {
		if (!texts || !Array.isArray(texts) || !this.config.enabled) {
			return texts.map(() => this.getFallback());
		}

		const results = [];
		const aiTexts = [];
		const aiIndices = [];

		// First pass: cache lookup and keyword matching
		for (let i = 0; i < texts.length; i++) {
			const text = texts[i];

			if (!text) {
				results[i] = this.getFallback();
				continue;
			}

			const cacheKey = this.getCacheKey(text, {});
			if (this.resultCache?.has(cacheKey)) {
				results[i] = this.resultCache.get(cacheKey);
				continue;
			}

			// Try keyword matching first
			const keywordResult = this._performKeywordAnalysis(text);

			// If keyword matching is confident enough, use it
			if (
				keywordResult.confidence >= 0.8 ||
				!this.config.useAI ||
				text.length < this.config.minTextLength
			) {
				results[i] = keywordResult;
				if (this.resultCache) {
					this.resultCache.set(cacheKey, keywordResult);
				}
			} else {
				// Need AI analysis
				aiTexts.push(text);
				aiIndices.push(i);
				results[i] = keywordResult; // Fallback
			}
		}

		// Batch AI analysis if needed
		if (aiTexts.length > 0 && this.config.useAI) {
			try {
				const aiResults = await this.aiAnalyzer.analyzeBatch(
					aiTexts,
					this.config.aiProvider || "openai"
				);

				for (let i = 0; i < aiResults.length; i++) {
					const originalIndex = aiIndices[i];
					const aiResult = aiResults[i];

					if (aiResult) {
						const processedResult = {
							category: aiResult.category,
							confidence: aiResult.confidence,
							prompt: aiResult.prompt,
							matches: aiResult.keywords?.length || 0,
							aiAnalyzed: true,
							keywords: aiResult.keywords || [],
						};

						results[originalIndex] = processedResult;
						if (this.resultCache) {
							const cacheKey = this.getCacheKey(aiTexts[i], {});
							this.resultCache.set(cacheKey, processedResult);
						}
					}
				}

				// Log batch AI analysis summary
				if (aiResults.some((r) => r)) {
					log(
						`Batch AI Context Analysis: ${aiResults.filter((r) => r).length}/${aiTexts.length} analyzed`,
						true
					);
				}
			} catch (error) {
				console.error("Batch AI context analysis failed:", error.message);
			}
		}

		return results;
	}

	/**
	 * Perform context analysis on a single text.
	 * @param {string} text - Text to analyze.
	 * @returns {Promise<Object>} - Context analysis result.
	 */
	async analyze(text) {
		const results = await this.analyzeBatch([text]);
		return results[0];
	}

	/**
	 * Perform keyword-based analysis on text.
	 * @param {string} text - Text to analyze.
	 * @returns {Object} - Keyword analysis result.
	 * @private
	 */
	_performKeywordAnalysis(text) {
		const lowerText = text.toLowerCase();
		const results = new Map();
		let totalScore = 0;

		const isShortText = text.length < 500;

		for (const [category, config] of this.keywordCache.entries()) {
			let matches;

			if (isShortText) {
				matches = lowerText.match(config.regex) || [];
			} else {
				matches = [];
				const keywords = this.config.categories[category].keywords;

				for (const keyword of keywords) {
					const keywordLower = keyword.toLowerCase();
					let pos = lowerText.indexOf(keywordLower);
					while (pos !== -1) {
						const prevChar = lowerText[pos - 1];
						const nextChar = lowerText[pos + keywordLower.length];
						const isPrevBoundary = !prevChar || !/[a-z0-9_]/i.test(prevChar);
						const isNextBoundary = !nextChar || !/[a-z0-9_]/i.test(nextChar);

						if (isPrevBoundary && isNextBoundary) {
							matches.push(keyword);
						}
						pos = lowerText.indexOf(keywordLower, pos + 1);
					}
				}
			}

			if (matches.length >= this.config.detection.threshold) {
				const score = matches.length * config.weight;
				results.set(category, {
					score,
					matches: matches.length,
					prompt: config.prompt,
				});
				totalScore += score;
			}
		}

		return this.getBestMatch(results, totalScore);
	}

	/**
	 * Determine the best category match from analysis results.
	 * @param {Map} results - Map of category scores.
	 * @param {number} totalScore - Total score across all categories.
	 * @returns {Object} - Best match result.
	 */
	getBestMatch(results, totalScore) {
		if (totalScore === 0) return this.getFallback();

		const bestMatches = Array.from(results.entries())
			.map(([category, data]) => ({
				category,
				confidence: data.score / totalScore,
				prompt: data.prompt,
				matches: data.matches,
			}))
			.filter((match) => match.confidence >= this.config.detection.minConfidence)
			.sort((a, b) => b.confidence - a.confidence);

		return bestMatches[0] || this.getFallback();
	}

	/**
	 * Get fallback analysis result.
	 * @returns {Object} - Fallback result.
	 */
	getFallback() {
		return {
			category: this.config.fallback.category,
			confidence: 1.0,
			prompt: this.config.fallback.prompt,
			matches: 0,
		};
	}

	/**
	 * Generate a collision-resistant cache key for text and context.
	 * @param {string} text - processing text.
	 * @param {Object} context - processing context.
	 * @returns {string} - Cache key.
	 */
	getCacheKey(text, context) {
		let keyContent;

		if (text.length <= 200) {
			// Short text: use as-is
			keyContent = text;
		} else if (text.length <= 1000) {
			// Medium text: sample from beginning, middle, and end
			const third = Math.floor(text.length / 3);
			const start = text.substring(0, 50);
			const middle = text.substring(third, third + 50);
			const end = text.substring(text.length - 50);
			keyContent = `${start}|MID:${middle}|${end}`;
		} else {
			// Long text: smart sampling with length and position info
			const quarter = Math.floor(text.length / 4);
			const start = text.substring(0, 40);
			const q1 = text.substring(quarter, quarter + 30);
			const q2 = text.substring(quarter * 2, quarter * 2 + 30);
			const q3 = text.substring(quarter * 3, quarter * 3 + 30);
			const end = text.substring(text.length - 40);

			// Include text length and character diversity info for uniqueness
			const charSet = new Set(text.toLowerCase()).size;
			keyContent = `LEN:${text.length}|CHARS:${charSet}|${start}|Q1:${q1}|Q2:${q2}|Q3:${q3}|${end}`;
		}

		const contextString = JSON.stringify(context);
		const hashInput = `${keyContent}|CTX:${contextString}`;

		return crypto.createHash("sha256").update(hashInput, "utf8").digest("hex").substring(0, 32); // Truncate for storage efficiency while maintaining uniqueness
	}
}

export default ContextProcessor;
