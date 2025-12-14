import RetryHelper from "../utils/retry-helper.js";
import rateLimiter from "../utils/rate-limiter.js";
import { TranslateOptions, ProviderConfig } from "../providers/base-provider.js";

export interface ProviderModule {
	translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options?: TranslateOptions
	): Promise<string>;
	analyze?(prompt: string, options?: ProviderConfig): Promise<string>;
	chat?(messages: any[], options?: ProviderConfig): Promise<string>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

export interface ProviderWrapper {
	name: string;
	implementation: ProviderModule;
}

interface ProviderStats {
	success: number;
	failure: number;
	avgResponseTime: number;
	totalTime: number;
	lastSuccess: Date | null;
	consecutiveFailures: number;
	lastError: { time: Date; message: string } | null;
	disabled: boolean;
	disabledUntil: number | null;

	// Add derived stats for getStats()
	successRate?: number;
	totalCalls?: number;
	avgResponseTimeMs?: number;
	isDisabled?: boolean;
	enablesInMs?: number;
}

class FallbackProvider {
	private providers: ProviderWrapper[];
	private currentIndex: number;
	private providerStats: Map<string, ProviderStats>;
	private maxRetries: number;
	private reRankInterval: number;
	private operationCount: number;
	private lastErrorTime: number | null;
	private consecutiveErrors: number;

	constructor(providers: ProviderWrapper[]) {
		this.providers = providers;
		this.currentIndex = 0;
		this.providerStats = new Map();
		this.maxRetries = 2;
		this.reRankInterval = 10;
		this.operationCount = 0;
		this.lastErrorTime = null;
		this.consecutiveErrors = 0;

		this.providers.forEach((provider) => {
			const providerName = this._getProviderName(provider);
			this.providerStats.set(providerName, {
				success: 0,
				failure: 0,
				avgResponseTime: 0,
				totalTime: 0,
				lastSuccess: null,
				consecutiveFailures: 0,
				lastError: null,
				disabled: false,
				disabledUntil: null,
			});
		});
	}

	_calculatePriority(text: string): number {
		if (!text) return 1;
		if (text.length < 100) return 2;
		if (text.length > 800) return 0;
		return 1;
	}

	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): Promise<string> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const errors: any[] = [];
		const startTime = Date.now();
		const startIndex = this.currentIndex;
		let currentAttempt = 0;

		this._checkAndReRankProviders();

		const availableProviders = this.providers.filter(
			(_, index) => !this._isProviderDisabled(this.providers[index])
		);

		if (availableProviders.length === 0) {
			this._resetDisabledProviders();
			availableProviders.push(...this.providers);
		}

		const totalProviders = availableProviders.length;
		const maxAttempts = totalProviders * (this.maxRetries + 1);

		while (currentAttempt < maxAttempts) {
			const currentProviderIndex = this.currentIndex % totalProviders;
			const providerData = availableProviders[currentProviderIndex];
			const providerName = this._getProviderName(providerData);
			const currentProvider = providerData.implementation;

			this.operationCount++;

			try {
				if (!this.providerStats.has(providerName)) {
					this.providerStats.set(providerName, {
						success: 0,
						failure: 0,
						avgResponseTime: 0,
						totalTime: 0,
						lastSuccess: null,
						consecutiveFailures: 0,
						lastError: null,
						disabled: false,
						disabledUntil: null,
					});
				}

				const providerStartTime = Date.now();
				const result = await rateLimiter.enqueue(
					providerName.toLowerCase(),
					() =>
						RetryHelper.withRetry(
							() => currentProvider.translate(text, sourceLang, targetLang, options),
							{
								maxRetries: 0,
								context: `Fallback:${providerName}`,
								logContext: {
									source: sourceLang,
									target: targetLang,
									providerIndex: currentProviderIndex,
									attempt: currentAttempt + 1,
									maxAttempts,
								},
							}
						),
					this._calculatePriority(text)
				);

				const responseTime = Date.now() - providerStartTime;

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const stats = this.providerStats.get(providerName)!;
				stats.success++;
				stats.consecutiveFailures = 0;
				stats.lastSuccess = new Date();

				const prevTotal = stats.avgResponseTime * (stats.success + stats.failure - 1);
				stats.totalTime = prevTotal + responseTime;
				stats.avgResponseTime = stats.totalTime / (stats.success + stats.failure);

				this.consecutiveErrors = 0;
				this.lastErrorTime = null;

				return result;
			} catch (error: any) {
				if (this.providerStats.has(providerName)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const stats = this.providerStats.get(providerName)!;
					stats.failure++;
					stats.consecutiveFailures++;
					stats.lastError = {
						time: new Date(),
						message: error.message,
					};

					if (stats.consecutiveFailures >= 5) {
						this._disableProvider(providerData, 2 * 60 * 1000);
					}
				}

				this.consecutiveErrors++;
				this.lastErrorTime = Date.now();

				errors.push({
					provider: providerName,
					error: error.message,
					attempt: currentAttempt + 1,
				});

				const safeProviderName = `Provider_${(currentProviderIndex % totalProviders) + 1}`;
				const safeErrorMessage =
					error.message.includes("API") || error.message.includes("key")
						? "Authentication or API error"
						: error.message.substring(0, 100);

				console.warn(
					`${safeProviderName} failed (attempt ${currentAttempt + 1}/${maxAttempts}): ${safeErrorMessage}`
				);

				currentAttempt++;
				this.currentIndex++;
			}
		}

		this.currentIndex = startIndex;

		throw new Error(
			`All providers failed after ${maxAttempts} attempts (${Date.now() - startTime}ms):\n${JSON.stringify(errors, null, 2)}`
		);
	}

	async analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const errors: any[] = [];
		const startTime = Date.now();
		const savedIndex = this.currentIndex;
		let currentAttempt = 0;

		this._checkAndReRankProviders();

		const availableProviders = this.providers.filter(
			(provider) =>
				!this._isProviderDisabled(provider) &&
				typeof provider.implementation.analyze === "function"
		);

		if (availableProviders.length === 0) {
			this._resetDisabledProviders();
			availableProviders.push(
				...this.providers.filter((p) => typeof p.implementation.analyze === "function")
			);
		}

		const totalProviders = availableProviders.length;
		if (totalProviders === 0) {
			throw new Error("No providers support analysis capability");
		}

		const maxAttempts = totalProviders * (this.maxRetries + 1);

		while (currentAttempt < maxAttempts) {
			const currentProviderIndex = currentAttempt % totalProviders;
			const providerData = availableProviders[currentProviderIndex];
			const providerName = this._getProviderName(providerData);
			const currentProvider = providerData.implementation;

			this.operationCount++;

			try {
				if (!this.providerStats.has(providerName)) {
					this.providerStats.set(providerName, {
						success: 0,
						failure: 0,
						avgResponseTime: 0,
						totalTime: 0,
						lastSuccess: null,
						consecutiveFailures: 0,
						lastError: null,
						disabled: false,
						disabledUntil: null,
					});
				}

				const providerStartTime = Date.now();

				const result = await rateLimiter.enqueue(
					providerName.toLowerCase(),
					() =>
						RetryHelper.withRetry(
							() =>
								currentProvider.analyze
									? currentProvider.analyze(prompt, options)
									: Promise.reject(new Error("Analyze not supported")),
							{
								maxRetries: 0,
								context: `Fallback:${providerName}`,
								logContext: {
									providerIndex: currentProviderIndex,
									attempt: currentAttempt + 1,
									maxAttempts,
								},
							}
						),
					this._calculatePriority(prompt)
				);

				const responseTime = Date.now() - providerStartTime;

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const stats = this.providerStats.get(providerName)!;
				stats.success++;
				stats.consecutiveFailures = 0;
				stats.lastSuccess = new Date();

				const prevTotal = stats.avgResponseTime * (stats.success + stats.failure - 1);
				stats.totalTime = prevTotal + responseTime;
				stats.avgResponseTime = stats.totalTime / (stats.success + stats.failure);

				this.consecutiveErrors = 0;
				this.lastErrorTime = null;

				this.currentIndex = savedIndex;
				return result;
			} catch (error: any) {
				if (this.providerStats.has(providerName)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const stats = this.providerStats.get(providerName)!;
					stats.failure++;
					stats.consecutiveFailures++;
					stats.lastError = {
						time: new Date(),
						message: error.message,
					};

					if (stats.consecutiveFailures >= 5) {
						this._disableProvider(providerData, 2 * 60 * 1000);
					}
				}

				this.consecutiveErrors++;
				this.lastErrorTime = Date.now();

				errors.push({
					provider: providerName,
					error: error.message,
					attempt: currentAttempt + 1,
				});

				const safeProviderName = `Provider_${(currentProviderIndex % totalProviders) + 1}`;
				const safeErrorMessage =
					error.message.includes("API") || error.message.includes("key")
						? "Authentication or API error"
						: error.message.substring(0, 100);

				console.warn(
					`${safeProviderName} failed (attempt ${currentAttempt + 1}/${maxAttempts}): ${safeErrorMessage}`
				);

				currentAttempt++;
				this.currentIndex++;
			}
		}

		this.currentIndex = savedIndex;
		throw new Error(
			`All providers failed for analysis after ${maxAttempts} attempts (${Date.now() - startTime}ms):\n${JSON.stringify(errors, null, 2)}`
		);
	}

	async chat(messages: any[], options: ProviderConfig = {}): Promise<string> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const errors: any[] = [];
		const startTime = Date.now();
		const savedIndex = this.currentIndex;
		let currentAttempt = 0;

		this._checkAndReRankProviders();

		const availableProviders = this.providers.filter(
			(provider) =>
				!this._isProviderDisabled(provider) &&
				typeof provider.implementation.chat === "function"
		);

		if (availableProviders.length === 0) {
			this._resetDisabledProviders();
			availableProviders.push(
				...this.providers.filter((p) => typeof p.implementation.chat === "function")
			);
		}

		const totalProviders = availableProviders.length;
		if (totalProviders === 0) {
			throw new Error("No providers support chat capability");
		}

		const maxAttempts = totalProviders * (this.maxRetries + 1);

		while (currentAttempt < maxAttempts) {
			const currentProviderIndex = currentAttempt % totalProviders;
			const providerData = availableProviders[currentProviderIndex];
			const providerName = this._getProviderName(providerData);
			const currentProvider = providerData.implementation;

			this.operationCount++;

			try {
				if (!this.providerStats.has(providerName)) {
					this.providerStats.set(providerName, {
						success: 0,
						failure: 0,
						avgResponseTime: 0,
						totalTime: 0,
						lastSuccess: null,
						consecutiveFailures: 0,
						lastError: null,
						disabled: false,
						disabledUntil: null,
					});
				}

				const providerStartTime = Date.now();

				const result = await rateLimiter.enqueue(
					providerName.toLowerCase(),
					() =>
						RetryHelper.withRetry(
							() =>
								currentProvider.chat
									? currentProvider.chat(messages, options)
									: Promise.reject(new Error("Chat not supported")),
							{
								maxRetries: 0,
								context: `Fallback:${providerName}`,
								logContext: {
									providerIndex: currentProviderIndex,
									attempt: currentAttempt + 1,
									maxAttempts,
								},
							}
						),
					1 // Priority 1 (normal)
				);

				const responseTime = Date.now() - providerStartTime;

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const stats = this.providerStats.get(providerName)!;
				stats.success++;
				stats.consecutiveFailures = 0;
				stats.lastSuccess = new Date();

				const prevTotal = stats.avgResponseTime * (stats.success + stats.failure - 1);
				stats.totalTime = prevTotal + responseTime;
				stats.avgResponseTime = stats.totalTime / (stats.success + stats.failure);

				this.consecutiveErrors = 0;
				this.lastErrorTime = null;

				this.currentIndex = savedIndex;
				return result;
			} catch (error: any) {
				if (this.providerStats.has(providerName)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const stats = this.providerStats.get(providerName)!;
					stats.failure++;
					stats.consecutiveFailures++;
					stats.lastError = {
						time: new Date(),
						message: error.message,
					};

					if (stats.consecutiveFailures >= 5) {
						this._disableProvider(providerData, 2 * 60 * 1000);
					}
				}

				this.consecutiveErrors++;
				this.lastErrorTime = Date.now();

				errors.push({
					provider: providerName,
					error: error.message,
					attempt: currentAttempt + 1,
				});

				const safeProviderName = `Provider_${(currentProviderIndex % totalProviders) + 1}`;
				const safeErrorMessage =
					error.message.includes("API") || error.message.includes("key")
						? "Authentication or API error"
						: error.message.substring(0, 100);

				console.warn(
					`${safeProviderName} failed (attempt ${currentAttempt + 1}/${maxAttempts}): ${safeErrorMessage}`
				);

				currentAttempt++;
				this.currentIndex++;
			}
		}

		this.currentIndex = savedIndex;
		throw new Error(
			`All providers failed for chat after ${maxAttempts} attempts (${Date.now() - startTime}ms):\n${JSON.stringify(errors, null, 2)}`
		);
	}

	getStats(): Record<string, ProviderStats> {
		const stats = Object.fromEntries(this.providerStats);

		Object.keys(stats).forEach((provider) => {
			const providerStats = stats[provider];
			const total = providerStats.success + providerStats.failure;
			providerStats.successRate = total > 0 ? providerStats.success / total : 0;
			providerStats.totalCalls = total;
			providerStats.avgResponseTimeMs = Math.round(providerStats.avgResponseTime);

			const isDisabled = this._isProviderDisabled(
				this.providers.find((p) => this._getProviderName(p) === provider)
			);
			providerStats.isDisabled = isDisabled;

			if (isDisabled && providerStats.disabledUntil) {
				providerStats.enablesInMs = Math.max(0, providerStats.disabledUntil - Date.now());
			}
		});

		return stats;
	}

	reset(): void {
		this.currentIndex = 0;
		this._resetDisabledProviders();
	}

	resetStats(): void {
		this.providerStats.clear();
		this.providers.forEach((provider) => {
			const providerName = this._getProviderName(provider);
			this.providerStats.set(providerName, {
				success: 0,
				failure: 0,
				avgResponseTime: 0,
				totalTime: 0,
				lastSuccess: null,
				consecutiveFailures: 0,
				lastError: null,
				disabled: false,
				disabledUntil: null,
			});
		});
		this.operationCount = 0;
		this.consecutiveErrors = 0;
		this.lastErrorTime = null;
	}

	_checkAndReRankProviders(): void {
		if (this.operationCount % this.reRankInterval !== 0) {
			return;
		}

		const providerRanks = this.providers.map((provider, index) => {
			const name = this._getProviderName(provider);
			const stats = this.providerStats.get(name) || {
				success: 0,
				failure: 0,
				avgResponseTime: 0,
				consecutiveFailures: 0,
			};
			const total = stats.success + stats.failure;

			let score = 0;
			if (total > 0) {
				const successRate = stats.success / total;
				const responseTimePenalty =
					stats.avgResponseTime > 0 ? Math.min(0.3, stats.avgResponseTime / 5000) : 0;

				score = successRate * (1 - responseTimePenalty);

				if (stats.consecutiveFailures > 0) {
					score -= Math.min(0.5, stats.consecutiveFailures * 0.1);
				}
			}

			return { provider, index, score };
		});

		const hasEnoughData = providerRanks.some(
			(p) => (this.providerStats.get(this._getProviderName(p.provider))?.success || 0) > 2
		);

		if (!hasEnoughData) {
			return;
		}

		providerRanks.sort((a, b) => b.score - a.score);

		this.providers = providerRanks.map((p) => p.provider);
		this.currentIndex = 0;
	}

	_disableProvider(provider: ProviderWrapper, timeoutMs: number = 2 * 60 * 1000): void {
		const providerName = this._getProviderName(provider);
		const stats = this.providerStats.get(providerName);
		if (stats) {
			stats.disabled = true;
			stats.disabledUntil = Date.now() + timeoutMs;

			setTimeout(() => {
				stats.disabled = false;
				stats.disabledUntil = null;
				console.log(`Re-enabled provider: ${providerName}`);
			}, timeoutMs);

			console.log(
				`Temporarily disabled provider ${providerName} for ${timeoutMs / 1000}s due to failures`
			);
		}
	}

	_isProviderDisabled(provider?: ProviderWrapper): boolean {
		if (!provider) return true;

		const providerName = this._getProviderName(provider);
		const stats = this.providerStats.get(providerName);

		if (!stats) return false;

		if (stats.disabled && stats.disabledUntil && Date.now() > stats.disabledUntil) {
			stats.disabled = false;
			stats.disabledUntil = null;
			return false;
		}

		return stats.disabled === true;
	}

	_resetDisabledProviders(): void {
		this.providerStats.forEach((stats) => {
			stats.disabled = false;
			stats.disabledUntil = null;
		});
	}

	_getProviderName(provider: ProviderWrapper): string {
		return provider?.name || "Unknown";
	}
}

export default FallbackProvider;
