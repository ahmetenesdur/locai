import crypto from "crypto";
import { FileManager } from "./file-manager.js"; // Note: Changed named import to default import based on file-manager migration
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StateOptions {
	enabled?: boolean;
	stateFileName?: string;
	stateDir?: string;
	[key: string]: any;
}

export interface StateComparison {
	deletedKeys: string[];
	modifiedKeys: string[];
	newKeys: string[];
	hasChanges: boolean;
}

export interface StateComparisonStats {
	totalChanges: number;
	deletedCount: number;
	modifiedCount: number;
	newCount: number;
	hasChanges: boolean;
}

/**
 * StateManager - Tracks changes in source locale files using hash-based state management
 * This enables detection of deleted/modified keys to synchronize target locale files
 */
class StateManager {
	private options: Required<StateOptions>;

	constructor(options: StateOptions | { stateTracking: StateOptions } = {}) {
		// Support both direct options and nested stateTracking config
		const stateTracking = "stateTracking" in options ? options.stateTracking : options;

		this.options = {
			enabled: stateTracking.enabled !== false,
			stateFileName: stateTracking.stateFileName || "localization.state.json",
			stateDir: stateTracking.stateDir || ".localize-cache",
			...stateTracking,
		};
	}

	/**
	 * Generate a SHA-256 hash for given text content
	 */
	_generateHash(text: string | object): string {
		if (typeof text !== "string") {
			text = JSON.stringify(text);
		}
		return crypto.createHash("sha256").update(text, "utf8").digest("hex");
	}

	/**
	 * Get the full path to the state file
	 */
	_getStateFilePath(projectRoot: string): string {
		const stateDir = path.join(projectRoot, this.options.stateDir);
		return path.join(stateDir, this.options.stateFileName);
	}

	/**
	 * Load previous state from state file
	 */
	async loadState(projectRoot: string): Promise<Record<string, string>> {
		try {
			const stateFilePath = this._getStateFilePath(projectRoot);
			const state = await FileManager.readJSON(stateFilePath);
			return (state as Record<string, string>) || {};
		} catch (error: any) {
			// State file doesn't exist or is corrupted - return empty state
			if (error.message.includes("File read error") || error.code === "ENOENT") {
				return {};
			}
			throw new Error(`Failed to load state: ${error.message}`);
		}
	}

	/**
	 * Save current state to state file
	 */
	async saveState(projectRoot: string, state: Record<string, string>): Promise<boolean> {
		try {
			const stateFilePath = this._getStateFilePath(projectRoot);

			// Ensure state directory exists
			const stateDir = path.dirname(stateFilePath);
			await FileManager.ensureDir(stateDir);

			// Save state with metadata
			const stateWithMetadata = {
				...state,
				_metadata: {
					lastUpdated: new Date().toISOString(),
					version: "1.0.0",
					toolVersion: JSON.parse(
						readFileSync(path.join(__dirname, "../../package.json"), "utf8")
					).version,
				},
			};

			await FileManager.writeJSON(stateFilePath, stateWithMetadata);
			return true;
		} catch (error: any) {
			throw new Error(`Failed to save state: ${error.message}`);
		}
	}

	/**
	 * Generate state object from source content by creating hashes for each key
	 */
	generateStateFromSource(sourceContent: Record<string, string>): Record<string, string> {
		const state: Record<string, string> = {};

		for (const [key, value] of Object.entries(sourceContent)) {
			// Generate hash for the value content
			state[key] = this._generateHash(value);
		}

		return state;
	}

	/**
	 * Compare two states and identify changes
	 */
	compareStates(
		previousState: Record<string, string>,
		currentState: Record<string, string>
	): StateComparison {
		const deletedKeys: string[] = [];
		const modifiedKeys: string[] = [];
		const newKeys: string[] = [];

		// Remove metadata from comparison if it exists
		const cleanPreviousState = { ...previousState };
		const cleanCurrentState = { ...currentState };
		delete cleanPreviousState["_metadata"];
		delete cleanCurrentState["_metadata"];

		// Find deleted keys (exist in previous but not in current)
		for (const key of Object.keys(cleanPreviousState)) {
			if (!(key in cleanCurrentState)) {
				deletedKeys.push(key);
			}
		}

		// Find modified and new keys
		for (const [key, currentHash] of Object.entries(cleanCurrentState)) {
			if (!(key in cleanPreviousState)) {
				// New key
				newKeys.push(key);
			} else if (cleanPreviousState[key] !== currentHash) {
				// Modified key (hash changed)
				modifiedKeys.push(key);
			}
		}

		return {
			deletedKeys,
			modifiedKeys,
			newKeys,
			hasChanges: deletedKeys.length > 0 || modifiedKeys.length > 0 || newKeys.length > 0,
		};
	}

	/**
	 * Get statistics about the state comparison
	 */
	getComparisonStats(comparison: StateComparison): StateComparisonStats {
		return {
			totalChanges:
				comparison.deletedKeys.length +
				comparison.modifiedKeys.length +
				comparison.newKeys.length,
			deletedCount: comparison.deletedKeys.length,
			modifiedCount: comparison.modifiedKeys.length,
			newCount: comparison.newKeys.length,
			hasChanges: comparison.hasChanges,
		};
	}

	/**
	 * Clean up old state files (maintenance utility)
	 */
	async cleanupState(projectRoot: string): Promise<boolean> {
		try {
			const stateFilePath = this._getStateFilePath(projectRoot);
			await FileManager.deleteFile(stateFilePath);
			return true;
		} catch (error: any) {
			// File doesn't exist - that's fine
			if (error.message.includes("ENOENT")) {
				return true;
			}
			throw new Error(`Failed to cleanup state: ${error.message}`);
		}
	}
}

export default StateManager;
