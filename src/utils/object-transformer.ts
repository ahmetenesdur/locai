/**
 * Utility class for object manipulation.
 */

/**
 * A value in a locale file: a primitive leaf, an array, or a nested object.
 */
export type TranslationValue =
	| string
	| number
	| boolean
	| null
	| TranslationValue[]
	| TranslationObject;

/**
 * A (possibly nested) locale object, e.g. `{ "home": { "title": "Hello" } }`.
 */
export interface TranslationObject {
	[key: string]: TranslationValue;
}

/**
 * A leaf of a flattened locale object. Arrays are kept whole, they are not flattened.
 */
export type FlatTranslationValue = Exclude<TranslationValue, TranslationObject>;

/**
 * A locale object flattened to dot-notation keys, e.g. `{ "home.title": "Hello" }`.
 */
export type FlatTranslations = Record<string, FlatTranslationValue>;

const isPlainObject = (value: TranslationValue): value is TranslationObject =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	value.constructor === Object;

interface StackItem {
	obj: TranslationObject;
	prefix: string;
	depth: number;
}

class ObjectTransformer {
	/**
	 * Flatten a nested object into a single-level object with dot notation keys.
	 * @param obj - The object to flatten.
	 * @param prefix - Prefix for keys (used internally).
	 * @param maxDepth - Maximum recursion depth.
	 * @returns Flattened object.
	 */
	static flatten(obj: TranslationObject, prefix = "", maxDepth = 20): FlatTranslations {
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
			return prefix ? { [prefix]: obj } : {};
		}

		const result: FlatTranslations = {};
		const stack: StackItem[] = [{ obj, prefix, depth: 0 }];

		while (stack.length > 0) {
			const stackItem = stack.pop();
			if (!stackItem) continue;

			const { obj: currentObj, prefix: currentPrefix, depth } = stackItem;

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

				if (isPlainObject(value)) {
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
	 * @param obj - The flattened object.
	 * @returns Nested object.
	 */
	static unflatten(obj: Record<string, TranslationValue>): TranslationObject {
		if (!obj || typeof obj !== "object") {
			return {};
		}

		const result: TranslationObject = {};
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
				let next = current[part];

				if (next == null || typeof next !== "object" || Array.isArray(next)) {
					next = {};
					current[part] = next;
				}

				current = next;
			}

			current[keyParts[lastIndex]] = value;
		}

		return result;
	}

	/**
	 * Create a deep copy of an object.
	 * @param obj - The object to clone.
	 * @param seen - Internal set to track circular references.
	 * @returns Deep copy of the object.
	 */
	static deepClone<T>(obj: T, seen = new WeakSet<object>()): T {
		if (obj === null || typeof obj !== "object") {
			return obj;
		}

		if (seen.has(obj)) {
			// Circular reference: break the cycle with an empty object
			return {} as T;
		}

		seen.add(obj);

		if (Array.isArray(obj)) {
			const result = obj.map((item) => this.deepClone(item, seen));
			seen.delete(obj);
			return result as T;
		}

		if (obj instanceof Date) {
			seen.delete(obj);
			return new Date(obj.getTime()) as T;
		}

		if (obj.constructor !== Object) {
			seen.delete(obj);
			return obj;
		}

		const source = obj as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(source)) {
			result[key] = this.deepClone(source[key], seen);
		}

		seen.delete(obj);
		return result as T;
	}

	/**
	 * deeply merge two objects.
	 * @param target - The target object.
	 * @param source - The source object.
	 * @param overwriteArrays - Whether to overwrite arrays or merge them.
	 * @returns Merged object.
	 */
	static mergeObjects(
		target: TranslationObject,
		source: TranslationObject,
		overwriteArrays = false
	): TranslationObject {
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
				// A non-object targetValue is returned unchanged by the guard at the top.
				const nestedTarget = (targetValue || {}) as TranslationObject;
				result[key] = this.mergeObjects(nestedTarget, sourceValue, overwriteArrays);
			} else {
				result[key] = sourceValue;
			}
		}

		return result;
	}
}

export default ObjectTransformer;
