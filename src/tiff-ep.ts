export class ScannerError extends Error {
	constructor(public errorMessage: string) {
		super(errorMessage);
	}
}

export type U8 = number;
export type U16 = number;
export type U32 = number;
export type I8 = number;
export type I16 = number;
export type I32 = number;

export class Scanner {
	private dataView: DataView;
	public offset: number = 0;

	constructor(
		data: Uint8Array,
		public byteOrder?: undefined | "big-endian" | "little-endian",
	) {
		this.dataView = new DataView(data.buffer);
	}

	u8(): U8 {
		if (this.offset >= this.dataView.byteLength) {
			throw new ScannerError("u8: out of bounds");
		}
		const u8 = this.dataView.getUint8(this.offset);
		this.offset += 1;
		return u8;
	}

	i8(): I8 {
		if (this.offset >= this.dataView.byteLength) {
			throw new ScannerError("i8: out of bounds");
		}
		const i8 = this.dataView.getInt8(this.offset);
		this.offset += 1;
		return i8;
	}

	u16(): U16 {
		if (!this.byteOrder) {
			throw new ScannerError("u16: undefined byteOrder");
		} else if (this.offset + 1 >= this.dataView.byteLength) {
			throw new ScannerError("u16: out of bounds");
		}
		const u16 = this.dataView.getUint16(this.offset, this.byteOrder === "little-endian");
		this.offset += 2;
		return u16;
	}

	i16(): I16 {
		if (!this.byteOrder) {
			throw new ScannerError("i16: undefined byteOrder");
		} else if (this.offset + 1 >= this.dataView.byteLength) {
			throw new ScannerError("i16: out of bounds");
		}
		const i16 = this.dataView.getInt16(this.offset, this.byteOrder === "little-endian");
		this.offset += 2;
		return i16;
	}

	u32(): U32 {
		if (!this.byteOrder) {
			throw new ScannerError("u32: undefined byteOrder");
		} else if (this.offset + 3 >= this.dataView.byteLength) {
			throw new ScannerError("u32: out of bounds");
		}
		const u32 = this.dataView.getUint32(this.offset, this.byteOrder === "little-endian");
		this.offset += 4;
		return u32;
	}

	i32(): I32 {
		if (!this.byteOrder) {
			throw new ScannerError("i32: undefined byteOrder");
		} else if (this.offset + 3 >= this.dataView.byteLength) {
			throw new ScannerError("i32: out of bounds");
		}
		const i32 = this.dataView.getInt32(this.offset, this.byteOrder === "little-endian");
		this.offset += 4;
		return i32;
	}

	int(n: "U8" | "U16" | "U32" | "I8" | "I16" | "I32"): I32 {
		if (!this.byteOrder) {
			throw new ScannerError("int: undefined byteOrder");
		}

		if (n === "U8") {
			return this.u8();
		} else if (n === "U16") {
			return this.u16();
		} else if (n === "U32") {
			return this.u32();
		} else if (n === "I8") {
			return this.i8();
		} else if (n === "I16") {
			return this.i16();
		} else if (n === "I32") {
			return this.i32();
		} else {
			const _: never = n;
			throw new Error();
		}
	}

	f32(): number {
		if (!this.byteOrder) {
			throw new ScannerError("f32: undefined byteOrder");
		} else if (this.offset + 3 >= this.dataView.byteLength) {
			throw new ScannerError("f32: out of bounds");
		}
		const f32 = this.dataView.getFloat32(this.offset, this.byteOrder === "little-endian");
		this.offset += 4;
		return f32;
	}

	f64(): number {
		if (!this.byteOrder) {
			throw new ScannerError("f64: undefined byteOrder");
		} else if (this.offset + 7 >= this.dataView.byteLength) {
			throw new ScannerError("f64: out of bounds");
		}
		const f64 = this.dataView.getFloat64(this.offset, this.byteOrder === "little-endian");
		this.offset += 8;
		return f64;
	}

	real(t: "F32" | "F64" | "Rational" | "SRational"): number {
		if (!this.byteOrder) {
			throw new ScannerError("real: undefined byteOrder");
		}

		if (t === "F32") {
			return this.f32();
		} else if (t === "F64") {
			return this.f64();
		} else if (t === "Rational") {
			const numerator = this.u32();
			const denominator = this.u32();
			return numerator / denominator;
		} else if (t === "SRational") {
			const numerator = this.i32();
			const denominator = this.i32();
			return numerator / denominator;
		} else {
			const _: never = t;
			throw new Error();
		}
	}
}

export type ImageFileDirectory = {
	entryCount: U16,
	entries: IFDEntry[],
	nextDirectory: U32,
};

export type FieldType = U16;

export type IFDEntry = {
	tag: U16,
	fieldType: FieldType,
	valueCount: U32,
	inlineOffset: U32,
	valueOffset: U32,
};

// From 4.1.2, Image File Directoryexport
export const FIELD_OTHER_TYPES = {
	2: { name: "ASCII", bytes: 1 },
	5: { name: "Rational", bytes: 8, real: true },
	7: { name: "Undefined", bytes: 1 },
	10: { name: "SRational", bytes: 8, real: true },
	11: { name: "F32", bytes: 2, real: true },
	12: { name: "F64", bytes: 4, real: true },
} as const;

export const FIELD_INT_TYPES = {
	1: { name: "U8", bytes: 1, int: true },
	3: { name: "U16", bytes: 2, int: true },
	4: { name: "U32", bytes: 4, int: true },
	6: { name: "I8", bytes: 1, int: true },
	8: { name: "I16", bytes: 2, int: true },
	9: { name: "I32", bytes: 4, int: true },
} as const;

export const FIELD_TYPES: Record<number, (typeof FIELD_INT_TYPES & typeof FIELD_OTHER_TYPES)[keyof typeof FIELD_INT_TYPES | keyof typeof FIELD_OTHER_TYPES]> = {
	...FIELD_INT_TYPES,
	...FIELD_OTHER_TYPES,
} as const;

export function scanIFDEntry(scanner: Scanner): IFDEntry {
	const tag = scanner.u16();
	const fieldType = scanner.u16();
	const valueCount = scanner.u32();
	const inlineOffset = scanner.offset;
	const valueOffset = scanner.u32();
	return {
		tag,
		fieldType,
		valueCount,
		inlineOffset,
		valueOffset,
	};
}

export function scanIFD(scanner: Scanner): ImageFileDirectory {
	const entryCount = scanner.u16();
	const entries = [];
	for (let i = 0; i < entryCount; i++) {
		entries.push(scanIFDEntry(scanner));
	}

	const nextDirectory = scanner.u32();

	return {
		entryCount,
		entries,
		nextDirectory,
	};
}

export function readASCII(
	scanner: Scanner,
	entry: IFDEntry,
): string | undefined {
	if (entry.fieldType !== 2) {
		return;
	}

	if (entry.valueCount <= 4) {
		scanner.offset = entry.inlineOffset;
	} else {
		scanner.offset = entry.valueOffset;
	}

	const bytes = new Uint8Array(entry.valueCount);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = scanner.u8();
	}
	return new TextDecoder().decode(bytes);
}

export function readInts(
	scanner: Scanner,
	entry: IFDEntry,
): number[] | undefined {
	const fieldInfo = FIELD_TYPES[entry.fieldType];
	if (!fieldInfo || !("int" in fieldInfo) || !fieldInfo.int) {
		return;
	}

	if (entry.valueCount * fieldInfo.bytes <= 4) {
		scanner.offset = entry.inlineOffset;
	} else {
		scanner.offset = entry.valueOffset;
	}

	const out = [];
	for (let i = 0; i < entry.valueCount; i++) {
		out[i] = scanner.int(fieldInfo.name);
	}
	return out;
}

export function readReals(
	scanner: Scanner,
	entry: IFDEntry,
): number[] | undefined {
	const fieldInfo = FIELD_TYPES[entry.fieldType];
	if (!fieldInfo || !("real" in fieldInfo) || !fieldInfo.real) {
		return;
	}

	if (entry.valueCount * fieldInfo.bytes <= 4) {
		scanner.offset = entry.inlineOffset;
	} else {
		scanner.offset = entry.valueOffset;
	}

	const out = [];
	for (let i = 0; i < entry.valueCount; i++) {
		out[i] = scanner.real(fieldInfo.name);
	}
	return out;
}

export function parseTIFF_EP(
	file: Uint8Array,
	options?: {
		fallbackByteOrder?: "little-endian" | "big-endian",
	},
) {
	if (file.length > 2 ** 32) {
		throw new Error("parseTIFF_EP: does not support files larger than 4 GiB");
	}

	const problems = [];

	const scanner = new Scanner(file);

	const bom0 = scanner.u8();
	const bom1 = scanner.u8();
	if (bom0 === 0x49 && bom1 === 0x49) {
		scanner.byteOrder = "little-endian";
	} else if (bom0 === 0x4d && bom1 === 0x4d) {
		scanner.byteOrder = "big-endian";
	} else {
		const fallback = options?.fallbackByteOrder || "little-endian";
		problems.push(
			`invalid BOM at offset 0: ${bom0} ${bom1}:` +
			`\n\texpected little-endian ${0x49} ${0x49}` +
			`\n\tor big-endian ${0x4d} ${0x4d}` +
			`\nFalling back to ${fallback}`,
		);
		scanner.byteOrder = fallback;
	}

	const tiffMarker = scanner.u16();
	if (tiffMarker !== 42) {
		problems.push(
			`unexpected TIFF version at offset 2: ${tiffMarker} (expected 42)`,
		);
	}

	let nextIFDOffset = scanner.u32();

	const ifds = [];
	while (nextIFDOffset !== 0 && ifds.length < 10_000) {
		scanner.offset = nextIFDOffset;
		const imageFileDirectory = scanIFD(scanner);
		ifds.push(imageFileDirectory);

		nextIFDOffset = imageFileDirectory.nextDirectory;
	}
	if (ifds.length > 9_000) {
		problems.push("too many IFDs!");
	}

	return {
		byteOrder: scanner.byteOrder!,
		ifds,
		problems,
		scanner,
	};
}
