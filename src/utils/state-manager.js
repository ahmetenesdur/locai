import crypto from "crypto";
import { FileManager } from "./file-manager.js";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * StateManager - Tracks changes in source locale files using hash-based state management
 * This enables detection of deleted/modified keys to synchronize target locale files
 */
class StateManager {
	constructor(options = {}) {
		// Support both direct options and nested stateTracking config
		const stateTracking = options.stateTracking || options;

		this.options = {
			enabled: stateTracking.enabled !== false,
			stateFileName: stateTracking.stateFileName || "localization.state.json",
			stateDir: stateTracking.stateDir || ".localize-cache",
			...options,
		};
	}

	/**
	 * Generate a SHA-256 hash for given text content
	 * @param {string} text - Text content to hash
	 * @returns {string} - SHA-256 hash in hexadecimal format
	 */
	_generateHash(text) {
		if (typeof text !== "string") {
			text = JSON.stringify(text);
		}
		return crypto.createHash("sha256").update(text, "utf8").digest("hex");
	}

	/**
	 * Get the full path to the state file
	 * @param {string} projectRoot - Project root directory
	 * @returns {string} - Full path to state file
	 */
	_getStateFilePath(projectRoot) {
		const stateDir = path.join(projectRoot, this.options.stateDir);
		return path.join(stateDir, this.options.stateFileName);
	}

	/**
	 * Load previous state from state file
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<Object>} - Previous state object or empty object if file doesn't exist
	 */
	async loadState(projectRoot) {
		try {
			const stateFilePath = this._getStateFilePath(projectRoot);
			const state = await FileManager.readJSON(stateFilePath);
			return state || {};
		} catch (error) {
			// State file doesn't exist or is corrupted - return empty state
			if (error.message.includes("File read error") || error.code === "ENOENT") {
				return {};
			}
			throw new Error(`Failed to load state: ${error.message}`);
		}
	}

	/**
	 * Save current state to state file
	 * @param {string} projectRoot - Project root directory
	 * @param {Object} state - State object to save
	 * @returns {Promise<boolean>} - Success status
	 */
	async saveState(projectRoot, state) {
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
		} catch (error) {
			throw new Error(`Failed to save state: ${error.message}`);
		}
	}

	/**
	 * Generate state object from source content by creating hashes for each key
	 * @param {Object} sourceContent - Flattened source locale content
	 * @returns {Object} - State object with key-hash pairs
	 */
	generateStateFromSource(sourceContent) {
		const state = {};

		for (const [key, value] of Object.entries(sourceContent)) {
			// Generate hash for the value content
			state[key] = this._generateHash(value);
		}

		return state;
	}

	/**
	 * Compare two states and identify changes
	 * @param {Object} previousState - Previous state object
	 * @param {Object} currentState - Current state object
	 * @returns {Object} - Object containing arrays of deleted, modified, and new keys
	 */
	compareStates(previousState, currentState) {
		const deletedKeys = [];
		const modifiedKeys = [];
		const newKeys = [];

		// Remove metadata from comparison if it exists
		const cleanPreviousState = { ...previousState };
		const cleanCurrentState = { ...currentState };
		delete cleanPreviousState._metadata;
		delete cleanCurrentState._metadata;

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
	 * @param {Object} comparison - Result from compareStates method
	 * @returns {Object} - Statistics object
	 */
	getComparisonStats(comparison) {
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
	 * @param {string} projectRoot - Project root directory
	 * @returns {Promise<boolean>} - Success status
	 */
	async cleanupState(projectRoot) {
		try {
			const stateFilePath = this._getStateFilePath(projectRoot);
			await FileManager.deleteFile(stateFilePath);
			return true;
		} catch (error) {
			// File doesn't exist - that's fine
			if (error.message.includes("ENOENT")) {
				return true;
			}
			throw new Error(`Failed to cleanup state: ${error.message}`);
		}
	}
}

export default StateManager;
