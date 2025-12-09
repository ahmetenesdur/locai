/**
 * Utility class for object manipulation.
 */
class ObjectTransformer {
	/**
	 * Flatten a nested object into a single-level object with dot notation keys.
	 * @param {Object} obj - The object to flatten.
	 * @param {string} [prefix=""] - Prefix for keys (used internally).
	 * @param {number} [maxDepth=20] - Maximum recursion depth.
	 * @returns {Object} - Flattened object.
	 */
	static flatten(obj, prefix = "", maxDepth = 20) {
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
			return prefix ? { [prefix]: obj } : {};
		}

		const result = {};
		const stack = [{ obj, prefix, depth: 0 }];

		while (stack.length > 0) {
			const stackItem = stack.pop();
			const currentObj = stackItem.obj;
			const currentPrefix = stackItem.prefix;
			const depth = stackItem.depth;

			if (depth > maxDepth) {
				result[currentPrefix] = "[Object too deep]";
				continue;
			}

			const keys = Object.keys(currentObj);
			const keysLength = keys.length;

			for (let i = 0; i < keysLength; i++) {
				const key = keys[i];
				const value = currentObj[key];
				const newKey = currentPrefix ? `${currentPrefix}.${key}` : key;

				if (
					value !== null &&
					typeof value === "object" &&
					!Array.isArray(value) &&
					value.constructor === Object
				) {
					stack.push({ obj: value, prefix: newKey, depth: depth + 1 });
				} else {
					result[newKey] = value;
				}
			}
		}

		return result;
	}

	/**
	 * Unflatten an object with dot notation keys into a nested object.
	 * @param {Object} obj - The flattened object.
	 * @returns {Object} - Nested object.
	 */
	static unflatten(obj) {
		if (!obj || typeof obj !== "object") {
			return {};
		}

		const result = {};
		const keys = Object.keys(obj);
		const keysLength = keys.length;

		keys.sort();

		for (let keyIndex = 0; keyIndex < keysLength; keyIndex++) {
			const key = keys[keyIndex];
			const value = obj[key];

			const keyParts = key.split(".");
			const partsLength = keyParts.length;

			if (partsLength === 0) continue;

			let hasEmptyPart = false;
			for (let i = 0; i < partsLength; i++) {
				if (keyParts[i] === "") {
					hasEmptyPart = true;
					break;
				}
			}
			if (hasEmptyPart) continue;

			let current = result;
			const lastIndex = partsLength - 1;

			for (let i = 0; i < lastIndex; i++) {
				const part = keyParts[i];

				if (
					current[part] == null ||
					typeof current[part] !== "object" ||
					Array.isArray(current[part])
				) {
					current[part] = {};
				}

				current = current[part];
			}

			current[keyParts[lastIndex]] = value;
		}

		return result;
	}

	/**
	 * Create a deep copy of an object.
	 * @param {any} obj - The object to clone.
	 * @param {WeakSet} [seen] - Internal set to track circular references.
	 * @returns {any} - Deep copy of the object.
	 */
	static deepClone(obj, seen = new WeakSet()) {
		if (obj === null || typeof obj !== "object") {
			return obj;
		}

		if (seen.has(obj)) {
			return {};
		}

		seen.add(obj);

		if (Array.isArray(obj)) {
			const result = obj.map((item) => this.deepClone(item, seen));
			seen.delete(obj);
			return result;
		}

		if (obj instanceof Date) {
			seen.delete(obj);
			return new Date(obj.getTime());
		}

		if (obj.constructor !== Object) {
			seen.delete(obj);
			return obj;
		}

		const result = {};
		for (const key of Object.keys(obj)) {
			result[key] = this.deepClone(obj[key], seen);
		}

		seen.delete(obj);
		return result;
	}

	/**
	 * deeply merge two objects.
	 * @param {Object} target - The target object.
	 * @param {Object} source - The source object.
	 * @param {boolean} [overwriteArrays=false] - Whether to overwrite arrays or merge them.
	 * @returns {Object} - Merged object.
	 */
	static mergeObjects(target, source, overwriteArrays = false) {
		if (!target || !source || typeof target !== "object" || typeof source !== "object") {
			return target;
		}

		const result = this.deepClone(target);

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = result[key];

			if (sourceValue === undefined) {
				continue;
			}

			if (Array.isArray(sourceValue)) {
				result[key] = overwriteArrays
					? [...sourceValue]
					: Array.isArray(targetValue)
						? [...targetValue, ...sourceValue]
						: [...sourceValue];
			} else if (
				sourceValue &&
				typeof sourceValue === "object" &&
				sourceValue.constructor === Object
			) {
				result[key] = this.mergeObjects(targetValue || {}, sourceValue, overwriteArrays);
			} else {
				result[key] = sourceValue;
			}
		}

		return result;
	}
}

export default ObjectTransformer;
