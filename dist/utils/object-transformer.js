/**
 * Utility class for object manipulation.
 */
class ObjectTransformer {
    /**
     * Flatten a nested object into a single-level object with dot notation keys.
     * @param obj - The object to flatten.
     * @param prefix - Prefix for keys (used internally).
     * @param maxDepth - Maximum recursion depth.
     * @returns Flattened object.
     */
    static flatten(obj, prefix = "", maxDepth = 20) {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return prefix ? { [prefix]: obj } : {};
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = {};
        const stack = [{ obj, prefix, depth: 0 }];
        while (stack.length > 0) {
            const stackItem = stack.pop();
            if (!stackItem)
                continue;
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
                if (value !== null &&
                    typeof value === "object" &&
                    !Array.isArray(value) &&
                    value.constructor === Object) {
                    stack.push({ obj: value, prefix: newKey, depth: depth + 1 });
                }
                else {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            if (partsLength === 0)
                continue;
            let hasEmptyPart = false;
            for (let i = 0; i < partsLength; i++) {
                if (keyParts[i] === "") {
                    hasEmptyPart = true;
                    break;
                }
            }
            if (hasEmptyPart)
                continue;
            let current = result;
            const lastIndex = partsLength - 1;
            for (let i = 0; i < lastIndex; i++) {
                const part = keyParts[i];
                if (current[part] == null ||
                    typeof current[part] !== "object" ||
                    Array.isArray(current[part])) {
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
     * @param obj - The object to clone.
     * @param seen - Internal set to track circular references.
     * @returns Deep copy of the object.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static deepClone(obj, seen = new WeakSet()) {
        if (obj === null || typeof obj !== "object") {
            return obj;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (seen.has(obj)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return {};
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seen.add(obj);
        if (Array.isArray(obj)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = obj.map((item) => this.deepClone(item, seen));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seen.delete(obj);
            return result;
        }
        if (obj instanceof Date) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seen.delete(obj);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new Date(obj.getTime());
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (obj.constructor !== Object) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seen.delete(obj);
            return obj;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = {};
        for (const key of Object.keys(obj)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result[key] = this.deepClone(obj[key], seen);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seen.delete(obj);
        return result;
    }
    /**
     * deeply merge two objects.
     * @param target - The target object.
     * @param source - The source object.
     * @param overwriteArrays - Whether to overwrite arrays or merge them.
     * @returns Merged object.
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
            }
            else if (sourceValue &&
                typeof sourceValue === "object" &&
                sourceValue.constructor === Object) {
                result[key] = this.mergeObjects(targetValue || {}, sourceValue, overwriteArrays);
            }
            else {
                result[key] = sourceValue;
            }
        }
        return result;
    }
}
export default ObjectTransformer;
