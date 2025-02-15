
// B2: General sequential and progressive syntax
// CompressedImageData := StartOfImageMarker Frame EndOfImageMarker
// Frame := TablesAndMisc FrameHeader Scan1 DNLSegment? OtherScans*
// Scan := TablesAndMisc ScanHeader ECS0 RST0 ... ECS_n-1 RST_n-1 ECS_n
// ECS := MCU*

// FrameHeader :=
// SOF0 | SOF1 | SOF2 | SOF3 | SOF9 | SOF10 | SOF11
// Lf
// P
// Y
// X
// Nf
// Component*

// Component := C H V Tq

export class JPEGError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export function unstuffBytes(bytes: Uint8Array): Uint8Array {
	const stuffed = [];
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0xff && bytes[i + 1] === 0x00) {
			stuffed.push(i + 1);
		}
	}

	if (stuffed.length === 0) {
		return bytes;
	}
	const out = new Uint8Array(bytes.length - stuffed.length);
	let cursor = 0;
	let write = 0;
	for (let i = 0; i < bytes.length; i++) {
		if (i === stuffed[cursor]) {
			cursor += 1;
			continue;
		}
		out[write] = bytes[i];
		write += 1;
	}
	return out;
}

export type U16 = number;

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

export class HuffmanTable<T> {
	private pairs: {
		msbAlignedCode: U16,
		msbAlignedMask: U16,
		bits: number,
		value: T,
	}[] = [];

	constructor(
		pairs: { msbAlignedCode: U16, bits: number, value: T }[]
	) {
		for (const p of pairs) {
			this.pairs.push({
				msbAlignedCode: p.msbAlignedCode,
				msbAlignedMask: ((1 << p.bits) - 1) << (16 - p.bits),
				bits: p.bits,
				value: p.value,
			});
		}
	}

	decode(stream: BitStream): T {
		const front = stream.peek16BigEndian();
		for (const pair of this.pairs) {
			if (((front ^ pair.msbAlignedCode) & pair.msbAlignedMask) === 0) {
				stream.advanceBits(pair.bits);
				return pair.value;
			}
		}
		throw new JPEGError(
			`HuffmanTable.decode: invalid stream at (byte ${stream.offsetBytes}, bit ${stream.offsetBitsInByte}): leading bits: ${front.toString(2)}`
		);
	}
}

export function decodeDHT(dht: Uint8Array) {

}

export function decodeJpeg(jpeg: Uint8Array) {
	// Example:
	// M[d8: SOI*] M[c3: SOF3, Lossless (sequential)] 14 M[c4: DHT] 28 M[c4: DHT] 28 M[da: SOS] 27663 M[d9: EOI*]

	// {
	//   x0: 3840,
	//   x1: 4096,
	//   y0: 2816,
	//   y1: 3072,
	//   offset: 11128948,
	//   byteCount: 27745,
	//   tileWidth: [ 256 ],
	//   tileLength: [ 256 ]
	// }
	// 0xFFD8 (SOI*) @ 0
	// 0xFFC3 (SOF3: Lossless sequential) @ 2 (Section B.2.2)
	// Uint8Array(14) [
	//     [0, 14], [16  ], [1, 0 ], [0, 128], [2   ], [0   ], [17=0001_0001], [0    ], [1   ], [17        ], [0    ]
	//     [Lf=14], [P=16], [Y=256], [X=128 ], [Nf=2], [C1=0], [H1=1 | V1=1 ], [Tq1=0], [C2=1], [H2=1, V2=1], [Tq2=0]
	// ]
	// NOTE: In this example, Nf=2 (not 1, as expected from SamplesPerPixel=1 in a CFAPattern image)
	// but X=128, only half of the tileWidth=256.
	// 0xFFC4 (DHT) @ 18 (Section B.2.4.2)
	// Uint8Array(28) [
	//     [0, 28], [0=0000_0000b], [1, 1, 1, 1; 1, 1, 1, 1; 1, 0, 0, 0; 0, 0, 0, 0], [0, 2, 3, 1, 4, 11, 10, 5, 15]
	//     [Lh=28], [Tc=0,  Th=0 ], [L = .... Total = 9.                           ], [HUFFVALs                    ]
	// ]
	// 0xFFC4 (DHT) @ 48
	// Uint8Array(28) [
	//     [0, 28], [1=0000_0000b], [1, 1, 1, 1; 1, 1, 1, 1; 1, 0, 0, 0; 0, 0, 0, 0], [0, 2, 3, 1, 4, 11, 10, 5, 15]
	// ]
	// 0xFFDA (SOS) @ 78
	// Uint8Array(27663) [
	//     0,  10,   2,   0,   0,   1,  16,   1,   0,   0, 255,   0,
	//     4,   3, 255,   0,   4,   7, 195, 205, 182, 188, 239,  39,
	//   179, 206,  50, 206, 244, 211,  23, 161, 203, 169,  74, 243,
	//   139, 228, 114, 189,  56, 247, 158, 122, 228,  87, 167, 149,
	//   200, 158, 105, 167, 102,  49, 219,  89, 236, 119, 108, 185,
	//   180, 227, 205, 180, 211,  62,  82, 242, 239, 115, 206, 107,
	//     78, 115, 146, 237, 114,  89, 222, 217, 247, 126, 227, 206,
	//   235, 174,  30, 109, 185,  90, 121, 100, 174, 235, 201, 229,
	//     86,  60, 187, 174,
	//   ... 27563 more items
	// ]
	// 0xFFD9 (EOI*) @ 27743

	// SOF3 begins a Frame header.
	// It is followed by:
	// Lf: U16 (big-endian), length of frame header (B1.1.1.4). Includes Lf but not SOF.
	// P: U8 (sample precision in bits)
	// Y: U16 (number of lines)
	// X: U16 (number of columns in highest-resolution component)
	// Nf: U8 (number of components)
	// <component specific parameters>

	// Find markers
	const markers = [];
	for (let i = 0; i + 1 < jpeg.length; i++) {
		if (jpeg[i] === 0xff && jpeg[i + 1] !== 0xff && jpeg[i + 1] !== 0x00) {
			markers.push({
				offset: i,
				marker: jpeg[i + 1],
			});
		}
	}

	if (markers[0].offset !== 0) {
		throw new JPEGError("expected SOI marker at offset 0");
	}

	const elements = [];
	for (let i = 0; i < markers.length; i++) {
		elements.push(markers[i]);
		const between = jpeg.slice(
			markers[i].offset + 2,
			i + 1 < markers.length
				? markers[i + 1].offset
				: jpeg.length,
		);
		if (between.length !== 0) {
			elements.push(between);
		}
	}

	for (const e of elements) {
		if (e instanceof Uint8Array) {
			console.log(e);
		} else {
			console.log("0xFF" + e.marker.toString(16).toUpperCase(), "@", e.offset);
		}
	}

	return markers.map(x => x.marker);
}
