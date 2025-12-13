/**
 * Retry helper for API operations with exponential backoff
 */

export interface RetryOptions {
	provider?: string;
	perProviderRetry?: Record<string, Partial<RetryConfig>>;
	retryableErrors?: string[];
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	context?: string;
	logContext?: Record<string, any>;
	retryCondition?: (
		error: any,
		attempts: number,
		maxRetries: number
	) => boolean | Promise<boolean>;
}

export interface RetryConfig {
	maxRetries: number;
	initialDelay: number;
	maxDelay: number;
}

export interface RetryStats {
	attempts: number;
	totalTime: number;
	provider?: string;
	success?: boolean;
}

/**
 * Retry helper for API operations with exponential backoff.
 */
class RetryHelper {
	/**
	 * Retry an operation with configurable backoff strategy.
	 * Supports per-provider retry configuration.
	 */
	static async withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
		const providerName = options.provider?.toLowerCase();
		const perProviderRetry = options.perProviderRetry || {};
		const retryableErrors = options.retryableErrors || [
			"rate_limit",
			"timeout",
			"network",
			"server",
			"unknown",
		];

		// Get provider-specific retry settings or use defaults
		let maxRetries = options.maxRetries ?? 2;
		let initialDelay = options.initialDelay ?? 1000;
		let maxDelay = options.maxDelay ?? 10000;

		// Override with provider-specific settings if available
		if (providerName && perProviderRetry[providerName]) {
			const providerConfig = perProviderRetry[providerName];
			maxRetries = providerConfig.maxRetries ?? maxRetries;
			initialDelay = providerConfig.initialDelay ?? initialDelay;
			maxDelay = providerConfig.maxDelay ?? maxDelay;
		}

		const context = options.context ?? "Operation";
		const logContext = options.logContext ?? {};
		const retryCondition =
			options.retryCondition ??
			((error: any) => this.defaultRetryCondition(error, retryableErrors));

		let lastError: any = null;
		let attempts = 0;
		const startTime = Date.now();
		const retryStats: RetryStats = { attempts: 0, totalTime: 0, provider: providerName };

		while (attempts <= maxRetries) {
			try {
				retryStats.attempts = attempts;

				if (attempts > 0) {
					const delay = this.calculateBackoff(attempts, initialDelay, maxDelay);
					if (process.env.DEBUG) {
						const providerInfo = providerName ? ` [${providerName}]` : "";
						console.log(
							`${context}${providerInfo}: Retrying attempt ${attempts}/${maxRetries} after ${delay}ms delay`
						);
					}
					await this.delay(delay);
				}

				const result = await operation();

				// Track time if this was a retry
				if (attempts > 0) {
					retryStats.totalTime = Date.now() - startTime;
					retryStats.success = true;

					if (process.env.DEBUG) {
						console.log(
							`${context}: Succeeded after ${attempts} retries (${retryStats.totalTime}ms)`
						);
					}
				}

				return result;
			} catch (error: any) {
				attempts++;
				lastError = error;

				if (!error.retryInfo) {
					error.retryInfo = {
						attemptNumber: attempts,
						maxRetries,
						willRetry: attempts <= maxRetries,
						context: logContext,
						provider: providerName,
					};
				}

				const shouldRetry =
					attempts <= maxRetries && (await retryCondition(error, attempts, maxRetries));

				if (process.env.DEBUG) {
					const providerInfo = providerName ? ` [${providerName}]` : "";
					console.warn(
						`Warning: ${context}${providerInfo}: Error on attempt ${attempts}/${maxRetries + 1}: ${error.message}` +
							(error.code ? ` [${error.code}]` : "")
					);
				}
				if (!shouldRetry) {
					break;
				}
			}
		}

		retryStats.totalTime = Date.now() - startTime;
		retryStats.success = false;

		if (lastError) {
			lastError.retryStats = retryStats;
			lastError.message = `${lastError.message} (after ${attempts} attempts over ${retryStats.totalTime}ms)`;
		}

		throw lastError;
	}

	/**
	 * Calculate exponential backoff with jitter.
	 */
	static calculateBackoff(attempt: number, initialDelay: number, maxDelay: number): number {
		const expBackoff = Math.min(maxDelay, initialDelay * Math.pow(2, attempt - 1));

		return Math.floor(Math.random() * expBackoff);
	}

	/**
	 * Default retry condition based on error type.
	 * Checks against retryableErrors list.
	 */
	static defaultRetryCondition(error: any, retryableErrors: string[] = []): boolean {
		// Check for rate_limit errors
		if (
			retryableErrors.includes("rate_limit") &&
			(error.status === 429 || error.code === "ERR_RATE_LIMIT")
		) {
			return true;
		}

		// Check for timeout errors
		if (
			retryableErrors.includes("timeout") &&
			(error.code === "ETIMEDOUT" ||
				error.code === "ECONNABORTED" ||
				error.message?.includes("timeout"))
		) {
			return true;
		}

		// Check for network errors
		if (
			retryableErrors.includes("network") &&
			(error.code === "ECONNRESET" ||
				error.code === "ECONNREFUSED" ||
				error.code === "ENOTFOUND" ||
				error.code === "ERR_NETWORK" ||
				error.message?.includes("network") ||
				error.message?.includes("connection"))
		) {
			return true;
		}

		// Check for server errors (5xx)
		if (retryableErrors.includes("server") && error.status >= 500 && error.status < 600) {
			return true;
		}

		// Check for unknown/general errors
		if (retryableErrors.includes("unknown") && !error.status) {
			return true;
		}

		// Legacy fallback for backward compatibility
		if (retryableErrors.length === 0) {
			// Old behavior when no retryableErrors specified
			if (error.status && error.status >= 400 && error.status < 500) {
				if (error.status === 429) return true;
				if ([408, 425, 449].includes(error.status)) return true;
				return false;
			}

			if (
				error.code === "ECONNRESET" ||
				error.code === "ETIMEDOUT" ||
				error.code === "ECONNREFUSED" ||
				error.code === "ENOTFOUND" ||
				error.message?.includes("network") ||
				error.message?.includes("timeout") ||
				error.message?.includes("connection")
			) {
				return true;
			}

			return error.status >= 500 || !error.status;
		}

		return false;
	}

	/**
	 * Promise-based delay.
	 */
	static delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

export default RetryHelper;
