import rateLimiter from "./rate-limiter.js";

// We'll define a simple interface for the rate limiter status if we can't import it yet.
// Since rate-limiter.js is still JS, TS sees it as 'any' or based on inference if allowJs is on.
// We will simply treat it as any for now until we migrate it, or assume inference works.

export type ShutdownCallback = () => Promise<void> | void;

export interface ShutdownOptions {
	shutdownTimeout?: number;
	waitForPending?: boolean;
	logger?: Console | any; // 'any' for our custom Logger instance compatibility
}

class GracefulShutdown {
	private options: Required<ShutdownOptions>;
	private isShuttingDown: boolean;
	private shutdownCallbacks: ShutdownCallback[];
	private logger: Console | any;

	constructor(options: ShutdownOptions = {}) {
		this.options = {
			shutdownTimeout: 5000,
			waitForPending: true,
			...options,
		} as Required<ShutdownOptions>;

		this.isShuttingDown = false;
		this.shutdownCallbacks = [];
		this.logger = options.logger || console;
	}

	registerCallback(callback: ShutdownCallback): void {
		if (typeof callback === "function") {
			this.shutdownCallbacks.push(callback);
		}
	}

	unregisterCallback(callback: ShutdownCallback): void {
		if (typeof callback === "function") {
			const index = this.shutdownCallbacks.indexOf(callback);
			if (index > -1) {
				this.shutdownCallbacks.splice(index, 1);
			}
		}
	}

	init(): void {
		process.on("SIGTERM", () => this.handleSignal("SIGTERM"));
		process.on("SIGINT", () => this.handleSignal("SIGINT"));

		process.on("uncaughtException", (err: Error) => {
			this.logger.error("Uncaught Exception:", err);
			this.shutdown(1);
		});

		process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
			this.logger.error("Unhandled Rejection at:", promise, "reason:", reason);
			this.shutdown(1);
		});

		this.logger.info("Graceful shutdown handlers initialized");
	}

	async handleSignal(signal: string): Promise<void> {
		this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
		await this.shutdown(0);
	}

	async shutdown(exitCode = 0): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;
		this.logger.info("Starting graceful shutdown...");

		const timeoutPromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				this.logger.warn(
					`Shutdown timeout (${this.options.shutdownTimeout}ms) exceeded, forcing exit`
				);
				resolve();
			}, this.options.shutdownTimeout);
		});

		const shutdownProcess = this.performShutdown();

		try {
			await Promise.race([shutdownProcess, timeoutPromise]);
		} catch (error) {
			this.logger.error("Error during shutdown:", error);
		} finally {
			process.exit(exitCode);
		}
	}

	async performShutdown(): Promise<void> {
		const startTime = Date.now();

		try {
			this.logger.info("Executing shutdown callbacks...");
			for (const callback of this.shutdownCallbacks) {
				try {
					await callback();
				} catch (error) {
					this.logger.warn("Error in shutdown callback:", error);
				}
			}

			if (this.options.waitForPending) {
				this.logger.info("Waiting for pending operations...");
				await this.waitForPendingOperations();
			}

			const duration = Date.now() - startTime;
			this.logger.info(`Graceful shutdown completed in ${duration}ms`);
		} catch (error) {
			this.logger.error("Error during shutdown process:", error);
		}
	}

	async waitForPendingOperations(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const providerStatus: Record<string, any> = (rateLimiter as any).getStatus();
		let hasPending = false;

		for (const [provider, status] of Object.entries(providerStatus)) {
			if (status.queueSize > 0 || status.processing > 0) {
				hasPending = true;
				this.logger.info(
					`Waiting for ${status.queueSize} queued and ${status.processing} processing operations for ${provider}`
				);
			}
		}

		if (hasPending) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			try {
				(rateLimiter as any).clearAllQueues();
				this.logger.info("Forced queue cleanup completed");
			} catch (error: any) {
				this.logger.warn("Error during forced queue cleanup:", error.message);
			}
		}
	}
}

const gracefulShutdown = new GracefulShutdown();

// Can't auto-init if we want to test or configure it, but existing code did this.
gracefulShutdown.init();

export default gracefulShutdown;
