import rateLimiter from "./rate-limiter.js";

export type ShutdownCallback = () => Promise<void> | void;

/** Minimal logging surface used during shutdown; satisfied by `console` and our `Logger`. */
export interface ShutdownLogger {
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

export interface ShutdownOptions {
	shutdownTimeout?: number;
	waitForPending?: boolean;
	logger?: ShutdownLogger;
}

class GracefulShutdown {
	private options: Required<ShutdownOptions>;
	private isShuttingDown: boolean;
	private shutdownCallbacks: ShutdownCallback[];
	private logger: ShutdownLogger;
	/** stdout or stderr failed (closed pipe, dead parent): nothing can be printed anymore. */
	private outputClosed: boolean;

	constructor(options: ShutdownOptions = {}) {
		this.options = {
			shutdownTimeout: 5000,
			waitForPending: true,
			...options,
		} as Required<ShutdownOptions>;

		this.isShuttingDown = false;
		this.shutdownCallbacks = [];
		this.logger = options.logger || console;
		this.outputClosed = false;
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

	/** Log through the configured logger, unless the output streams are gone. */
	private log(level: keyof ShutdownLogger, ...args: unknown[]): void {
		if (!this.outputClosed) {
			this.logger[level](...args);
		}
	}

	init(): void {
		process.on("SIGTERM", () => this.handleSignal("SIGTERM"));
		process.on("SIGINT", () => this.handleSignal("SIGINT"));

		process.on("uncaughtException", (err: Error) => {
			this.log("error", "Uncaught Exception:", err);
			this.shutdown(1);
		});

		process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
			this.log("error", "Unhandled Rejection at:", promise, "reason:", reason);
			this.shutdown(1);
		});

		// When the reader of stdout or stderr goes away (a closed pipe, a parent that died),
		// every later write fails. Left unhandled, each failure is an uncaught exception, and
		// logging that exception fails as well: the process then spins without ever exiting.
		// Stop printing and shut down instead; the run was cut short, so the exit code is 1.
		process.stdout.on("error", () => {
			if (!this.outputClosed) {
				this.log("error", "Output closed (nothing is reading stdout); stopping.");
			}
			this.handleClosedOutput();
		});
		process.stderr.on("error", () => this.handleClosedOutput());

		this.log("info", "Graceful shutdown handlers initialized");
	}

	private handleClosedOutput(): void {
		this.outputClosed = true;
		this.shutdown(1);
	}

	async handleSignal(signal: string): Promise<void> {
		this.log("info", `Received ${signal}, initiating graceful shutdown...`);
		await this.shutdown(0);
	}

	async shutdown(exitCode = 0): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;
		this.log("info", "Starting graceful shutdown...");

		const timeoutPromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				this.log(
					"warn",
					`Shutdown timeout (${this.options.shutdownTimeout}ms) exceeded, forcing exit`
				);
				resolve();
			}, this.options.shutdownTimeout);
		});

		const shutdownProcess = this.performShutdown();

		try {
			await Promise.race([shutdownProcess, timeoutPromise]);
		} catch (error) {
			this.log("error", "Error during shutdown:", error);
		} finally {
			process.exit(exitCode);
		}
	}

	async performShutdown(): Promise<void> {
		const startTime = Date.now();

		try {
			this.log("info", "Executing shutdown callbacks...");
			for (const callback of this.shutdownCallbacks) {
				try {
					await callback();
				} catch (error) {
					this.log("warn", "Error in shutdown callback:", error);
				}
			}

			if (this.options.waitForPending) {
				this.log("info", "Waiting for pending operations...");
				await this.waitForPendingOperations();
			}

			const duration = Date.now() - startTime;
			this.log("info", `Graceful shutdown completed in ${duration}ms`);
		} catch (error) {
			this.log("error", "Error during shutdown process:", error);
		}
	}

	async waitForPendingOperations(): Promise<void> {
		const providerStatus = rateLimiter.getStatus();
		let hasPending = false;

		for (const [provider, status] of Object.entries(providerStatus)) {
			if (status.queueSize > 0 || status.processing > 0) {
				hasPending = true;
				this.log(
					"info",
					`Waiting for ${status.queueSize} queued and ${status.processing} processing operations for ${provider}`
				);
			}
		}

		if (hasPending) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			try {
				rateLimiter.clearAllQueues();
				this.log("info", "Forced queue cleanup completed");
			} catch (error) {
				this.log(
					"warn",
					"Error during forced queue cleanup:",
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	}
}

const gracefulShutdown = new GracefulShutdown();

// Can't auto-init if we want to test or configure it, but existing code did this.
gracefulShutdown.init();

export default gracefulShutdown;
