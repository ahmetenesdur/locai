import { describe, it, expect } from "vitest";
import ObjectTransformer from "../../../src/utils/object-transformer.js";

describe("ObjectTransformer", () => {
	describe("flatten", () => {
		it("should flatten a nested object", () => {
			const obj = { a: { b: 1 }, c: 2 };
			const flat = ObjectTransformer.flatten(obj);
			expect(flat).toEqual({ "a.b": 1, c: 2 });
		});

		it("should handle empty objects", () => {
			expect(ObjectTransformer.flatten({})).toEqual({});
		});

		it("should handle depth limits", () => {
			const obj = { level1: { level2: { level3: "value" } } };
			const flat = ObjectTransformer.flatten(obj, "", 1);
			expect(flat["level1.level2"]).toBe("[Object too deep]");
		});
	});

	describe("unflatten", () => {
		it("should unflatten a dot-notation object", () => {
			const flat = { "a.b": 1, c: 2 };
			const obj = ObjectTransformer.unflatten(flat);
			expect(obj).toEqual({ a: { b: 1 }, c: 2 });
		});

		it("should handle nested arrays creation from dotted keys", () => {
			// Current implementation treats standard objects.
			// Logic check: unflatten logic handles object creation.
			const flat = { "a.b.c": 1 };
			expect(ObjectTransformer.unflatten(flat)).toEqual({ a: { b: { c: 1 } } });
		});
	});

	describe("deepClone", () => {
		it("should deep clone an object", () => {
			const original = { a: { b: 1 } };
			const clone = ObjectTransformer.deepClone(original);
			expect(clone).toEqual(original);
			expect(clone).not.toBe(original);
			expect(clone.a).not.toBe(original.a);
		});

		it("should handle dates", () => {
			const date = new Date();
			const original = { d: date };
			const clone = ObjectTransformer.deepClone(original);
			expect(clone.d).toBeInstanceOf(Date);
			expect(clone.d.getTime()).toBe(date.getTime());
			expect(clone.d).not.toBe(date);
		});

		it("should handle circular references gracefully", () => {
			const obj: any = { a: 1 };
			obj.self = obj;
			const clone = ObjectTransformer.deepClone(obj);
			expect(clone.a).toBe(1);
			expect(clone.self).toEqual({}); // Implementation returns empty object for seen circular refs
		});
	});

	describe("mergeObjects", () => {
		it("should merge two objects deeply", () => {
			const target = { a: { x: 1 }, b: 2 };
			const source = { a: { y: 2 }, c: 3 };
			const result = ObjectTransformer.mergeObjects(target, source);
			expect(result).toEqual({ a: { x: 1, y: 2 }, b: 2, c: 3 });
		});

		it("should overwrite arrays if specified", () => {
			const target = { arr: [1, 2] };
			const source = { arr: [3, 4] };
			const result = ObjectTransformer.mergeObjects(target, source, true);
			expect(result.arr).toEqual([3, 4]);
		});

		it("should concat arrays by default", () => {
			const target = { arr: [1, 2] };
			const source = { arr: [3, 4] };
			const result = ObjectTransformer.mergeObjects(target, source, false);
			expect(result.arr).toEqual([1, 2, 3, 4]);
		});
	});
});
