import axios from "axios";
import ProviderFactory from "../core/provider-factory.js";
import rateLimiter from "./rate-limiter.js";
import { LRUCache } from "lru-cache";
import crypto from "crypto";
import { log } from "./logger.js";

class AIContextAnalyzer {
	constructor(config) {
		this.config = config;
		this.cache = new LRUCache({
			max: config.cacheSize || 500,
			ttl: config.cacheTTL || 1000 * 60 * 60 * 24,
			updateAgeOnGet: true,
			allowStale: true,
		});

		this.categoryKeywords = {};
		if (config.categories) {
			Object.entries(config.categories).forEach(([category, data]) => {
				if (data.keywords && Array.isArray(data.keywords)) {
					this.categoryKeywords[category] = new Set(
						data.keywords.map((k) => k.toLowerCase())
					);
				}
			});
		}

		this.stats = {
			totalAnalyzed: 0,
			aiCalls: 0,
			cacheHits: 0,
			keywordMatches: 0,
			newCategories: 0,
			errors: 0,
		};
	}

	// Batch analysis for multiple texts - much more efficient
	async analyzeBatch(texts, apiProvider = "openai") {
		if (!texts || !Array.isArray(texts) || !this.config.enabled) {
			return texts.map(() => null);
		}

		const results = [];
		const aiTexts = [];
		const aiIndices = [];

		// First pass: keyword matching and cache lookup
		for (let i = 0; i < texts.length; i++) {
			const text = texts[i];

			if (!text) {
				results[i] = null;
				continue;
			}

			if (text.length < this.config.minTextLength) {
				results[i] = this._fastKeywordMatch(text);
				continue;
			}

			const cacheKey = this._getCacheKey(text);
			if (this.cache.has(cacheKey)) {
				this.stats.cacheHits++;
				results[i] = this.cache.get(cacheKey);
				continue;
			}

			const keywordMatch = this._fastKeywordMatch(text);
			if (keywordMatch && keywordMatch.confidence > 0.85) {
				this.stats.keywordMatches++;
				this.cache.set(cacheKey, keywordMatch);
				results[i] = keywordMatch;
				continue;
			}

			// Need AI analysis
			if (this.config.useAI) {
				aiTexts.push(text);
				aiIndices.push(i);
				results[i] = keywordMatch || this._getDefaultContext();
			} else {
				results[i] = keywordMatch || this._getDefaultContext();
			}
		}

		// Batch AI analysis if needed
		if (aiTexts.length > 0 && this.config.useAI) {
			try {
				const batchResults = await this._batchAIAnalysis(aiTexts, apiProvider);

				for (let i = 0; i < batchResults.length; i++) {
					const originalIndex = aiIndices[i];
					const aiResult = batchResults[i];

					if (aiResult) {
						results[originalIndex] = aiResult;
						const cacheKey = this._getCacheKey(aiTexts[i]);
						this.cache.set(cacheKey, aiResult);
					}
				}
			} catch (error) {
				console.error("Batch AI analysis failed:", error.message);
			}
		}

		return results;
	}

	// Single text analysis (legacy support)
	async analyzeContext(text, apiProvider = "openai") {
		const results = await this.analyzeBatch([text], apiProvider);
		return results[0];
	}

	// Efficient batch AI analysis
	async _batchAIAnalysis(texts, apiProvider) {
		if (texts.length === 0) return [];

		this.stats.totalAnalyzed += texts.length;
		this.stats.aiCalls++; // Only one API call for the batch

		const provider = ProviderFactory.getProvider(apiProvider, true, this.config);
		if (!provider) {
			throw new Error("AI provider not available for context analysis");
		}

		const batchPrompt = this._createBatchAnalysisPrompt(texts);

		const result = await rateLimiter.enqueue(apiProvider.toLowerCase(), () =>
			provider.analyze(batchPrompt, {
				...this.config.analysisOptions,
				maxTokens: Math.min(4000, this.config.analysisOptions?.maxTokens || 2000),
				timeout: this.config.analysisOptions?.timeout || 10000,
				retries: this.config.analysisOptions?.retries || 2,
			})
		);

		return this._parseBatchAnalysisResult(result, texts.length);
	}

	// Create batch analysis prompt for multiple texts
	_createBatchAnalysisPrompt(texts) {
		const categories = Object.keys(this.config.categories).join(", ");

		const maxTextLength = 200; // Shorter for batch processing
		const truncatedTexts = texts
			.map((text, index) => {
				const truncated =
					text.length > maxTextLength ? text.substring(0, maxTextLength) + "..." : text;
				return `${index + 1}. "${truncated}"`;
			})
			.join("\n");

		return `
TASK: Analyze the following ${texts.length} texts and determine their context categories. Be concise.

TEXTS TO ANALYZE:
${truncatedTexts}

AVAILABLE CATEGORIES: ${categories}

INSTRUCTIONS:
1. For each text, identify the primary context category
2. Provide a confidence score (0.0-1.0)
3. Be concise - this is batch processing

FORMAT YOUR RESPONSE AS JSON ARRAY:
[
  {"index": 1, "category": "category_name", "confidence": 0.0-1.0},
  {"index": 2, "category": "category_name", "confidence": 0.0-1.0},
  ...
]
`;
	}

	_createAnalysisPrompt(text) {
		const categories = Object.keys(this.config.categories).join(", ");

		const maxTextLength = this.config.analysisOptions?.maxTokens
			? Math.min(1500, this.config.analysisOptions.maxTokens * 5)
			: 1500;

		const truncatedText =
			text.length > maxTextLength ? text.substring(0, maxTextLength) + "..." : text;

		return `
TASK: Analyze the following text and determine its context category.

TEXT TO ANALYZE:
"""
${truncatedText}
"""

AVAILABLE CATEGORIES: ${categories}${this.config.allowNewCategories ? ", or suggest a new category if none of these fit" : ""}

INSTRUCTIONS:
1. Identify the primary context category of the text
2. Provide a confidence score (0.0-1.0)
3. Suggest 3-5 keywords that are relevant to this text
4. Provide a brief explanation of your categorization

FORMAT YOUR RESPONSE AS JSON:
{
  "category": "category_name",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "explanation": "Brief explanation of why this category was chosen"
}
`;
	}

	_createSimplifiedAnalysisPrompt(text) {
		const categories = Object.keys(this.config.categories).join(", ");

		return `
TASK: Categorize the following text. Be concise.

TEXT: "${text}"

CATEGORIES: ${categories}${this.config.allowNewCategories ? " (or suggest new)" : ""}

RESPONSE FORMAT:
{
  "category": "category_name",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
`;
	}

	// Parse batch analysis results
	_parseBatchAnalysisResult(result, expectedCount) {
		try {
			const jsonMatch = result.match(/\[[\s\S]*?\]/);
			if (!jsonMatch) {
				throw new Error("No valid JSON array found in AI response");
			}

			let analysisArray;
			try {
				analysisArray = JSON.parse(jsonMatch[0]);
			} catch (jsonError) {
				// Try to clean up the JSON
				const cleanedJson = jsonMatch[0]
					.replace(/,\s*]/g, "]")
					.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
				analysisArray = JSON.parse(cleanedJson);
			}

			if (!Array.isArray(analysisArray)) {
				throw new Error("Response is not an array");
			}

			// Create results array with proper indexing
			const results = new Array(expectedCount).fill(null);

			for (const item of analysisArray) {
				if (!item.category || typeof item.confidence !== "number" || !item.index) {
					continue;
				}

				const index = item.index - 1; // Convert to 0-based index
				if (index < 0 || index >= expectedCount) {
					continue;
				}

				let category = item.category.toLowerCase().trim();

				if (!this.config.categories[category] && this.config.allowNewCategories) {
					this._saveNewCategory(category, item.keywords || []);
					this.stats.newCategories++;
				} else if (!this.config.categories[category]) {
					category = this._findClosestCategory(category, item.keywords || []);
				}

				results[index] = {
					category,
					confidence: item.confidence,
					keywords: item.keywords || [],
					explanation: item.explanation || "Batch analysis",
					prompt: this.config.categories[category]?.prompt || this.config.fallback.prompt,
					method: "batch_ai",
				};
			}

			return results;
		} catch (error) {
			console.error("Error parsing batch AI analysis result:", error.message);
			return new Array(expectedCount).fill(null);
		}
	}

	_parseAnalysisResult(result) {
		try {
			const jsonMatch = result.match(/\{[\s\S]*?\}/);
			if (!jsonMatch) {
				throw new Error("No valid JSON found in AI response");
			}

			let analysisData;
			try {
				analysisData = JSON.parse(jsonMatch[0]);
			} catch (jsonError) {
				const cleanedJson = jsonMatch[0]
					.replace(/,\s*}/g, "}")
					.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
				analysisData = JSON.parse(cleanedJson);
			}

			if (!analysisData.category || typeof analysisData.confidence !== "number") {
				throw new Error("Invalid analysis data structure");
			}

			let category = analysisData.category.toLowerCase().trim();

			if (!this.config.categories[category] && this.config.allowNewCategories) {
				this._saveNewCategory(category, analysisData.keywords || []);
				this.stats.newCategories++;
			} else if (!this.config.categories[category]) {
				category = this._findClosestCategory(category, analysisData.keywords || []);
			}

			return {
				category,
				confidence: analysisData.confidence,
				keywords: analysisData.keywords || [],
				explanation: analysisData.explanation || "No explanation provided",
				prompt: this.config.categories[category]?.prompt || this.config.fallback.prompt,
			};
		} catch (error) {
			console.error("Error parsing AI analysis result:", error.message);
			return null;
		}
	}

	_fastKeywordMatch(text) {
		if (!text || !this.config?.categories) {
			return this._getDefaultContext();
		}

		const textLower = text.toLowerCase();
		const scores = {};
		let maxScore = 0;
		let bestCategory = this.config.fallback?.category || "general";

		for (const [category, keywordSet] of Object.entries(this.categoryKeywords)) {
			let score = 0;

			for (const keyword of keywordSet) {
				const regex = new RegExp(`\\b${keyword}\\b`, "i");
				if (regex.test(textLower)) {
					score += 2;
				} else if (textLower.includes(keyword)) {
					score += 1;
				}
			}

			if (score > 0) {
				const weight = this.config.categories[category]?.weight || 1.0;
				score *= weight;

				scores[category] = score;

				if (score > maxScore) {
					maxScore = score;
					bestCategory = category;
				}
			}
		}

		const maxPossibleScore = Math.max(8, Object.keys(this.categoryKeywords).length * 2);
		const baseConfidence = Math.min(0.9, maxScore / maxPossibleScore);
		const confidence = Math.min(0.95, 1 - Math.exp(-baseConfidence * 2));

		if (confidence < this.config.detection.minConfidence) {
			return this._getDefaultContext();
		}

		return {
			category: bestCategory,
			confidence,
			keywords: Array.from(this.categoryKeywords[bestCategory] || []).slice(0, 5),
			explanation: `Matched keywords for ${bestCategory} category`,
			prompt: this.config.categories[bestCategory]?.prompt || this.config.fallback.prompt,
			method: "keyword_match",
		};
	}

	_getDefaultContext() {
		return {
			category: this.config.fallback?.category || "general",
			confidence: 0.5,
			keywords: [],
			explanation: "Default category used",
			prompt: this.config.fallback?.prompt || "Translate naturally",
			method: "default",
		};
	}

	_findClosestCategory(suggestedCategory, keywords) {
		let bestMatch = this.config.fallback?.category || "general";
		let highestScore = 0;

		for (const [category, config] of Object.entries(this.config.categories)) {
			let score = 0;

			if (config.keywords && this.categoryKeywords[category]) {
				const keywordsLower = new Set(keywords.map((k) => k.toLowerCase()));

				for (const keyword of keywordsLower) {
					if (this.categoryKeywords[category].has(keyword)) {
						score += 1.5;
						continue;
					}

					for (const configKeyword of this.categoryKeywords[category]) {
						if (configKeyword.includes(keyword) || keyword.includes(configKeyword)) {
							score += 0.75;
							break;
						}
					}
				}
			}

			if (category.includes(suggestedCategory) || suggestedCategory.includes(category)) {
				score += 2;
			}

			if (score > highestScore) {
				highestScore = score;
				bestMatch = category;
			}
		}

		return bestMatch;
	}

	_saveNewCategory(category, keywords) {
		if (!this.config.categories[category]) {
			this.config.categories[category] = {
				keywords: keywords,
				prompt: `Translate with awareness of ${category} context`,
				weight: 1.0,
			};

			this.categoryKeywords[category] = new Set(keywords.map((k) => k.toLowerCase()));

			log(`Added new context category: ${category}`, true);
		}
	}

	/**
	 * Generate a collision-resistant cache key for text
	 */
	_getCacheKey(text) {
		let keyContent;

		if (text.length <= 100) {
			// Short text: use as-is (lowercased for consistency)
			keyContent = text.toLowerCase();
		} else if (text.length <= 500) {
			// Medium text: sample from beginning, middle, and end with better distribution
			const start = text.substring(0, 40).toLowerCase();
			const middlePos = Math.floor(text.length / 2);
			const middle = text.substring(middlePos - 20, middlePos + 20).toLowerCase();
			const end = text.substring(text.length - 40).toLowerCase();
			keyContent = `${start}|MID:${middle}|${end}`;
		} else {
			// Long text: enhanced sampling with length and character diversity
			const quarter = Math.floor(text.length / 4);
			const start = text.substring(0, 30).toLowerCase();
			const q1 = text.substring(quarter, quarter + 25).toLowerCase();
			const q2 = text.substring(quarter * 2, quarter * 2 + 25).toLowerCase();
			const q3 = text.substring(quarter * 3, quarter * 3 + 25).toLowerCase();
			const end = text.substring(text.length - 30).toLowerCase();

			// Include length and character diversity for additional uniqueness
			const charSet = new Set(text.toLowerCase()).size;
			const wordCount = text.split(/\s+/).length;
			keyContent = `LEN:${text.length}|WORDS:${wordCount}|CHARS:${charSet}|${start}|Q1:${q1}|Q2:${q2}|Q3:${q3}|${end}`;
		}

		return crypto
			.createHash("sha256")
			.update(keyContent, "utf8")
			.digest("hex")
			.substring(0, 32); // Truncate for storage efficiency while maintaining uniqueness
	}

	getStats() {
		return {
			...this.stats,
			cacheSize: this.cache.size,
			cacheCapacity: this.cache.max,
			hitRate: this.stats.cacheHits / Math.max(1, this.stats.totalAnalyzed),
			aiUsageRate: this.stats.aiCalls / Math.max(1, this.stats.totalAnalyzed),
			keywordMatchRate: this.stats.keywordMatches / Math.max(1, this.stats.totalAnalyzed),
			errorRate: this.stats.errors / Math.max(1, this.stats.totalAnalyzed),
		};
	}

	resetStats() {
		this.stats = {
			totalAnalyzed: 0,
			aiCalls: 0,
			cacheHits: 0,
			keywordMatches: 0,
			newCategories: 0,
			errors: 0,
		};
	}

	clearCache() {
		this.cache.clear();
	}
}

export default AIContextAnalyzer;
