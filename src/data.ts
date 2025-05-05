import { assert } from "./test.js";

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

export function mod(a: number, b: number) {
	if (a >= 0) {
		return a % b;
	}
	return (a % b) + b;
}

export class Scanner {
	private dataView: DataView;
	public offset: number = 0;

	constructor(
		data: Uint8Array,
		public byteOrder?: undefined | "big-endian" | "little-endian",
	) {
		const cloned = new Uint8Array([...data]);
		this.dataView = new DataView(cloned.buffer);
	}

	getSlice(slice: { offset: number, byteCount: number }) {
		return new Uint8Array(this.dataView.buffer, slice.offset, slice.byteCount);
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


export class BitStream {
	offsetBytes = 0;
	offsetBitsInByte = 0;
	paddingBit: 0 | 1 = 1;

	constructor(private bytes: Uint8Array) {
	}

	private byte(n: number): U8 {
		if (n >= this.bytes.length) {
			const paddingByte = this.paddingBit === 0
				? 0
				: 0b1111_1111;
			return paddingByte;
		}
		return this.bytes[n];
	}

	peek16BigEndian(): U16 {
		//   v: offsetBitsInByte=0
		// [ aaaa aaaa bbbb bbbb cccc cccc ]
		//   1111 1111 2222 2222 ---- ---- (shift right 8)

		//         v: offsetBitsInByte=5
		// [ aaaa aaaa bbbb bbbb cccc cccc ]
		//   ---- -111 1111 1222 2222 2--- (shift right 3)
		const bytes = (this.byte(this.offsetBytes) << 16)
			| (this.byte(this.offsetBytes + 1) << 8)
			| (this.byte(this.offsetBytes + 2) << 0);

		return (bytes >> (8 - this.offsetBitsInByte)) & 0b1111_1111_1111_1111;
	}

	advanceBits(bits: number): void {
		if (bits < 0) {
			throw new Error("advanceBits: bits must be non-negative");
		}
		this.offsetBitsInByte += bits;
		this.offsetBytes += (this.offsetBitsInByte >> 3);
		this.offsetBitsInByte = this.offsetBitsInByte & 0b111;
	}
}

{
	const stream = new BitStream(new Uint8Array([
		/* 0 */ 0b1011_0000,
		/* 8 */ 0b0101_1011,
		/* 16 */ 0b1111_1111,
		/* 24 */ 0b0010_0000,
		/* 32 */ 0b0000_0000,
		/* 40: 0b1111_1111 */
	]));
	assert(stream.peek16BigEndian(), "is equal to", 0b1011_0000_0101_1011);
	stream.advanceBits(1);
	assert(stream.peek16BigEndian(), "is equal to", 0b011_0000_0101_1011_1);
	stream.advanceBits(3);
	assert(stream.peek16BigEndian(), "is equal to", 0b0000_0101_1011_1111);
	stream.advanceBits(4);
	assert(stream.peek16BigEndian(), "is equal to", 0b0101_1011_1111_1111);
	stream.advanceBits(19);
	// at 27
	assert(stream.peek16BigEndian(), "is equal to", 0b0_0000_0000_0000_111);
	stream.advanceBits(1);
	assert(stream.peek16BigEndian(), "is equal to", 0b0000_0000_0000_1111);
	stream.advanceBits(1);
	assert(stream.peek16BigEndian(), "is equal to", 0b000_0000_0000_1111_1);
}

export function matrixMultiply(a: number[][], b: number[][]): number[][] {
	if (a[0].length !== b.length) {
		throw new Error(`matrixMultiply(${a.length}x${a[0].length}, ${b.length}x${b[0].length}): invalid dimensions`);
	}

	const out: number[][] = [];
	for (let r = 0; r < a.length; r++) {
		out[r] = [];
		for (let c = 0; c < b[0].length; c++) {
			out[r][c] = 0;
			for (let k = 0; k < a[0].length; k++) {
				out[r][c] += a[r][k] * b[k][c];
			}
		}
	}
	return out;
}

export function diagonalMatrix(diagonal: number[]): number[][] {
	const out: number[][] = [];
	for (let r = 0; r < diagonal.length; r++) {
		out[r] = [];
		for (let c = 0; c < diagonal.length; c++) {
			out[r][c] = 0;
		}
		out[r][r] = diagonal[r];
	}
	return out;
}

export function matrixInverse(matrix: number[][]): number[][] {
	// A^-1 = adjugate(A) / determinant(A)
	const adj = matrixAdjugate(matrix);
	const det = matrixDeterminant(matrix);
	for (const row of adj) {
		for (let c = 0; c < row.length; c++) {
			row[c] /= det;
		}
	}
	return adj;
}

export function matrixAdjugate(matrix: number[][]): number[][] {
	const out: number[][] = [];
	for (let r = 0; r < matrix.length; r++) {
		out[r] = [];
		for (let c = 0; c < matrix.length; c++) {
			const sign = (r % 2 === c % 2) ? 1 : -1;
			out[r][c] = sign * matrixDeterminant(dropRowColumn(matrix, c, r));
		}
	}
	return out;
}

export function dropRowColumn(matrix: number[][], dropRow: number, dropColumn: number): number[][] {
	const out: number[][] = [];
	for (let r = 0; r < matrix.length; r++) {
		if (r === dropRow) {
			continue;
		}
		const row: number[] = [];
		for (let c = 0; c < matrix[r].length; c++) {
			if (c === dropColumn) {
				continue;
			}
			row.push(matrix[r][c]);
		}
		out.push(row);
	}
	return out;
}

export function matrixDeterminant(matrix: number[][]): number {
	if (matrix[0].length !== matrix.length) {
		throw new Error("matrixDeterminant: only accepts square matrices");
	}

	if (matrix.length === 1) {
		return matrix[0][0];
	} else if (matrix.length === 2) {
		return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
	}

	let sum = 0;
	for (let c = 0; c < matrix.length; c++) {
		const cofactor = (c % 2 === 0 ? +1 : -1) * matrix[0][c];
		const minor = dropRowColumn(matrix, 0, c);
		sum += cofactor * matrixDeterminant(minor);
	}
	return sum;
}

export function matrixToArray(matrix: number[][]): number[] {
	const out = [];
	for (const row of matrix) {
		for (const v of row) {
			out.push(v);
		}
	}
	return out;
}

const product = matrixMultiply(
	[
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
	],
	[
		[10, 11, 12],
		[13, 14, 15],
		[16, 17, 19],
	],
);

if (JSON.stringify(product) !== "[[84,90,99],[201,216,237],[318,342,375]]") {
	throw new Error("invalid matrixMultiply result");
}
