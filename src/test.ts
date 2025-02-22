import type * as utilType from "node:util";

const util: typeof utilType = await (async function () {
	try {
		if (typeof window !== "undefined") {
			throw new Error("not node");
		}
		return await import("node:util");
	} catch (e) {
		const utilInspect: {
			readonly custom: unique symbol,
		} & ((a: any, b?: any) => string) = function (a: any, b?: any) {
			return String(a);
		} as any;

		(utilInspect as any).custom = Symbol("util.inspect.custom");
		return {
			inspect: utilInspect,
		} as any as typeof utilType;
	}
})();

export const spec = Symbol("test-spec");

export type Spec<T> = T
	| (T extends object ? { [K in keyof T]: Spec<T[K]> } : never)
	| { [spec]: (t: T) => ReturnType<typeof deepEqual>, [util.inspect.custom]?: any };

export function specSupersetOf<T>(subset: Set<T>): Spec<Set<T>> {
	return {
		[spec](test: Set<T>) {
			for (const e of subset) {
				if (!test.has(e)) {
					return { eq: false, path: [e] };
				}
			}
			return { eq: true };
		},
		[util.inspect.custom]: (depth: number, options: any) => {
			return "(any superset of) " + util.inspect(subset, options);
		},
	}
}

export function specIterableContainingOnly<T, IT extends Iterable<T>>(elements: IT): Spec<IT> {
	const set = new Set(elements);
	return {
		[spec](test: Iterable<T>) {
			for (const e of test) {
				if (!set.has(e)) {
					let found = false;
					for (const candidate of set) {
						if (deepEqual(e, candidate).eq) {
							found = true;
						}
					}
					if (!found) {
						return { eq: false, path: [e] };
					}
				}
			}
			return { eq: true };
		},
		[util.inspect.custom]: (depth: number, options: any) => {
			return "(iterable containing only) " + util.inspect(set, options);
		},
	};
}

export function specEq<T>(value: Spec<T>): Spec<T> {
	return {
		[spec](test: T) {
			return deepEqual(test, value);
		},
		[util.inspect.custom]: (depth: number, options: any) => {
			return util.inspect(value, options);
		},
	};
}

export function specSetEq<R extends Iterable<unknown>>(value: R): Spec<R> {
	return {
		[spec](test: R) {
			try {
				const setTest = new Set(test);
				const comparison = deepEqual(new Set(value), setTest);
				return comparison;
			} catch {
				// The `test` is not iterable.
				return { eq: false, path: [] };
			}
		},
		[util.inspect.custom]: (depth: number, options: any) => {
			return "(in any order) " + util.inspect(value, options);
		},
	};
}

export function specPredicate<T>(predicate: (t: T) => true | string[], description: string = "(custom predicate)"): Spec<T> {
	return {
		[spec](test: T) {
			const result = predicate(test);
			if (result === true) {
				return { eq: true };
			} else {
				return { eq: false, path: result };
			}
		},
		[util.inspect.custom]: () => description,
	};
}

export function specDescribe<T>(value: Spec<T>, description: string, path?: string): Spec<T> {
	return {
		[spec](test: T) {
			const cmp = deepEqual(test, value);
			if (cmp.eq === true) {
				return cmp;
			} else {
				cmp.description = description;
				if (path !== undefined) {
					cmp.path = [path].concat(cmp.path);
				}
				return cmp;
			}
		},
		[util.inspect.custom]: (depth: number, options: any) => {
			return util.inspect(value, options);
		},
	};
}

function deepEqual(
	a: any,
	b: Spec<any>,
): { eq: true } | { eq: false, path: any[], expectedValue?: any, description?: string } {
	if (b !== null && typeof b === "object" && spec in b) {
		return b[spec](a);
	} else if (a === b) {
		return { eq: true };
	} else if (typeof a !== typeof b) {
		return { eq: false, path: [], expectedValue: b };
	} else if (a instanceof Set && b instanceof Set) {
		for (let v of a) {
			if (!b.has(v)) {
				return { eq: false, path: [v] };
			}
		}
		for (let v of b) {
			if (!a.has(v)) {
				return { eq: false, path: [v] };
			}
		}
		return { eq: true };
	} else if (a instanceof Set || b instanceof Set) {
		return { eq: false, path: [] };
	} else if (a instanceof Map && b instanceof Map) {
		for (let [k, v] of a) {
			if (!b.has(k)) {
				return { eq: false, path: [k] };
			}
			const cmp = deepEqual(v, b.get(k));
			if (!cmp.eq) {
				return { eq: false, path: [k].concat(cmp.path) };
			}
		}
		for (let [k, v] of b) {
			if (!a.has(k)) {
				return { eq: false, path: [k] };
			}
			const cmp = deepEqual(v, a.get(k));
			if (!cmp.eq) {
				return { eq: false, path: [k].concat(cmp.path) };
			}
		}
		return { eq: true };
	} else if (a instanceof Map || b instanceof Map) {
		return { eq: false, path: [] };
	} else if (typeof a === "object") {
		if (a === null || b === null) {
			return { eq: false, path: [] };
		}

		let checked: any = {};
		for (let k in a) {
			const cmp = deepEqual(a[k], b[k]);
			if (!cmp.eq) {
				return { eq: cmp.eq, path: [k].concat(cmp.path) };
			}
			checked[k] = true;
		}
		for (let k in b) {
			if (!checked[k]) {
				return { eq: false, path: [k] };
			}
		}
		return { eq: true };
	} else {
		return { eq: false, path: [], expectedValue: b };
	}
}

export function assert<A, B extends A>(a: A, op: "is equal to", b: Spec<B>): asserts a is B;
export function assert<A>(a: A, op: A extends any[] ? "is array" : never): asserts a is any[] & A;
export function assert(a: () => void, op: "throws", e: unknown): void;
export function assert<A>(a: A | null, op: "is not null"): asserts a is A;

export function assert<A, B extends A>(...args: [A, "is equal to", B] | [any, "is array"] | [() => void, "throws", unknown] | [A, "is not null"]) {
	if (args[1] === "is equal to") {
		const [a, op, b] = args;
		const cmp = deepEqual(a, b);
		if (!cmp.eq) {
			const sa = util.inspect(a, { depth: 16, colors: true });
			const sb = util.inspect("expectedValue" in cmp ? cmp.expectedValue : b, { depth: 16, colors: true });
			const expected = "description" in cmp ? " (" + cmp.description + ")" : "";
			throw new Error(`Expected \n${sa}\nto be equal to\n${sb}${expected}\nbut found difference in path \`${JSON.stringify(cmp.path)}\``);
		}
	} else if (args[1] === "is array") {
		const [a, op] = args;
		if (!Array.isArray(a)) {
			throw new Error("Expected `" + JSON.stringify(a, null, "\t") + "` to be an array.");
		}
	} else if (args[1] === "throws") {
		const [f, op, expected] = args;
		let threw = false;
		try {
			f();
		} catch (e) {
			if (e instanceof Error) {
				throw e;
			}
			assert(e, "is equal to", expected);
			threw = true;
		}
		if (!threw) {
			throw new Error(`Expected an error to be thrown.`);
		}
	} else if (args[1] === "is not null") {
		const a = args[0];
		if (a === null) {
			const sa = util.inspect(a, { depth: 16, colors: true });
			throw new Error(`Expected \n${sa}\nto be not null.`);
		}
	} else {
		const _: never = args;
		throw new Error("unhandled assertion type `" + JSON.stringify(args[1]) + "`");
	}
}
