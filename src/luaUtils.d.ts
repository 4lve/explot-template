interface ObjectInterface {
	None: unknown;
	/**
	 * Copy the values of all of the enumerable own properties from one or more source objects to a
	 * target object. Returns the target object.
	 * @param target The target object to copy to.
	 * @param source The source object from which to copy properties.
	 */
	assign<T extends {}, U>(this: void, target: T, source: U): T & U;

	/**
	 * Copy the values of all of the enumerable own properties from one or more source objects to a
	 * target object. Returns the target object.
	 * @param target The target object to copy to.
	 * @param source1 The first source object from which to copy properties.
	 * @param source2 The second source object from which to copy properties.
	 */
	assign<T extends {}, U, V>(this: void, target: T, source1: U, source2: V): T & U & V;

	/**
	 * Copy the values of all of the enumerable own properties from one or more source objects to a
	 * target object. Returns the target object.
	 * @param target The target object to copy to.
	 * @param source1 The first source object from which to copy properties.
	 * @param source2 The second source object from which to copy properties.
	 * @param source3 The third source object from which to copy properties.
	 */
	assign<T extends {}, U, V, W>(this: void, target: T, source1: U, source2: V, source3: W): T & U & V & W;

	/**
	 * Copy the values of all of the enumerable own properties from one or more source objects to a
	 * target object. Returns the target object.
	 * @param target The target object to copy to.
	 * @param sources One or more source objects from which to copy properties
	 */
	assign(this: void, target: object, ...sources: any[]): any;

	create: (o: object | undefined) => any;
}

export declare const Object: ObjectInterface;

type Match = {
	index: number;
	match: string;
};

type Pattern = string | Array<string>;

declare function String(str: unknown): string;
declare namespace String {
	const charCodeAt: (str: string, index: number) => number;
	const endsWith: (value: string, substring: string, optionalLength?: number) => boolean;
	const slice: (str: string, startIndexStr: string | number, lastIndexStr?: string | number) => string;
	const findOr: (str: string, patternTable: string[], initIndex?: number) => Match | undefined;
	const split: (str: string, pattern?: Pattern) => string[];
	const startsWith: (value: string, substring: string, position?: number) => boolean;
	const trimStart: (str: string) => string;
	const trimEnd: (str: string) => string;
	const trim: (str: string) => string;
	const substr: (s: string, startIndex: number, numberOfCharacters?: number) => string;
	const fromCharCode: (...codes: number[]) => string;
	const sprintf: (format: string, ...args: any[]) => string;
	const charAt: (str: string, index: number) => string;
	const indexOf: (str: string, searchValue: string, fromIndex?: number) => number;
}

type ArraySlice<T> = (t: Array<T>, start_idx: number, end_idx?: number) => Array<T>;

declare const Arr: {
	slice: ArraySlice<any>;
};
