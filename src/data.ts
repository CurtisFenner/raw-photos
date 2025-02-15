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

	peek16BigEndian(): U16 {
		const paddingByte = this.paddingBit === 0
			? 0
			: 0b1111_1111;

		//   v: offsetBitsInByte=0
		// [ aaaa aaaa bbbb bbbb cccc cccc ]
		//   1111 1111 2222 2222 ---- ---- (shift right 8)

		//         v: offsetBitsInByte=5
		// [ aaaa aaaa bbbb bbbb cccc cccc ]
		//   ---- -111 1111 1222 2222 2--- (shift right 3)
		const bytes = ((this.bytes[this.offsetBytes] || paddingByte) << 16)
			| ((this.bytes[this.offsetBytes] || paddingByte) << 8)
			| ((this.bytes[this.offsetBytes] || paddingByte) << 0);

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
