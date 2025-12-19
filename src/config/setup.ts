import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import { FileManager } from "../utils/file-manager.js";
import { getLogger } from "../utils/logger.js";
import rateLimiter from "../utils/rate-limiter.js";

/**
 * Load environment variables from .env files.
 * Prioritizes .env.local over .env.
 */
export const loadEnvironmentVariables = async () => {
	// Load environment files in priority order
	// First load .env (base defaults), then .env.local (local overrides)
	// This ensures .env.local values take precedence over .env values
	const envFiles = [
		{ file: ".env", override: false },
		{ file: ".env.local", override: true },
	];
	let loadedCount = 0;

	for (const { file: envFile, override } of envFiles) {
		const envPath = path.resolve(process.cwd(), envFile);
		try {
			await fs.access(envPath);
			const result = dotenv.config({ path: envPath, override });

			if (!result.error) {
				loadedCount++;
				// Only log in verbose/debug mode to reduce noise
				if (process.env.VERBOSE || process.env.DEBUG) {
					console.log(`Loaded environment variables from ${envFile}`);
				}
			}
		} catch (error: any) {
			// ENOENT is expected when files don't exist - silently skip
			if (error.code !== "ENOENT") {
				console.warn(`Warning: Could not load ${envFile}: ${error.message}`);
			}
		}
	}

	// Informative message only if verbose/debug and at least one file was loaded
	if ((process.env.VERBOSE || process.env.DEBUG) && loadedCount > 0) {
		console.log(`Environment: ${loadedCount} file(s) loaded`);
	}
};

/**
 * Configure global components (logger, rate limiter, etc.).
 * @param {any} config - Configuration object.
 */
export const configureComponents = (config: any) => {
	// Configure FileManager with config settings
	if (config.fileOperations) {
		FileManager.configure(config.fileOperations);
	}

	// Initialize logger with config
	if (config.logging) {
		const logger = getLogger(config.logging);
		if (config.logging.verbose || config.debug) {
			logger.info("Logger initialized", {
				saveErrorLogs: config.logging.saveErrorLogs,
				logDirectory: config.logging.logDirectory,
				rotationEnabled: config.logging.logRotation?.enabled,
			});
		}
	}

	if (config.rateLimiter) {
		rateLimiter.updateConfig({
			queueStrategy: config.rateLimiter.queueStrategy || "priority",
			queueTimeout: config.rateLimiter.queueTimeout || 30000,
			adaptiveThrottling: config.rateLimiter.adaptiveThrottling !== false,
			providerLimits: config.rateLimiter.providerLimits,
		});
	}

	if (config.advanced?.debug) {
		process.env.DEBUG = "true";
	}

	if (config.logging?.verbose) {
		process.env.VERBOSE = "true";
	}
};
