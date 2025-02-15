import { BitStream, Scanner, U16, U8 } from "./data.js";
import { assert } from "./test.js";

export class JPEGError extends Error {
	constructor(message: string) {
		super(message);
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
			const msbAlignedMask = ((1 << p.bits) - 1) << (16 - p.bits);
			this.pairs.push({
				msbAlignedCode: p.msbAlignedCode,
				msbAlignedMask,
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

export type SOF3Header = {
	lines: number,
	samplesPerLine: number,
	components: {
		id: number,
		/** The details of MCU and different sample precision is,
		 * according to a remark under Figure 13 in 4.8.1,
		 * described in Annex A.
		 *
		 * However, most raw images should use 1.
		 */
		horizontalSampleFactor: number,
		verticalSampleFactor: number,
	}[],
};

/** See B.2.2 Frame header syntax.
 *
 */
export function decodeSof3FrameHeader(bytes: Uint8Array): SOF3Header {
	const scanner = new Scanner(bytes, "big-endian");
	const length = scanner.u16();
	if (length !== bytes.length) {
		throw new JPEGError(
			`decodeSof3FrameHeader: invalid Lf (expected ${bytes.length} but got ${length})`,
		);
	}

	const precision = scanner.u8();
	if (precision > 16 || precision < 2) {
		throw new JPEGError(
			`decodeSof3FrameHeader: invalid P: ${precision}`,
		);
	}

	const lines = scanner.u16();
	const samplesPerLine = scanner.u16();
	const componentCount = scanner.u8();
	const components = [];
	for (let k = 0; k < componentCount; k++) {
		const componentID = scanner.u8();
		const sampleFactors = scanner.u8();
		const horizontalSampleFactor = (sampleFactors & 0b1111_0000) >> 4;
		const verticalSampleFactor = (sampleFactors & 0b0000_1111);
		if (horizontalSampleFactor > 4 || verticalSampleFactor > 4) {
			throw new JPEGError(
				`decodeSof3FrameHeader: unsupported H_${k + 1} / V_${k + 1}: ${sampleFactors.toString(2).padStart(8, "0")}b`,
			);
		}
		const tq = scanner.u8();
		if (tq !== 0) {
			throw new JPEGError(
				`decodeSof3FrameHeader: unsupported Tq_${k + 1}: ${tq}`,
			);
		}
		components.push({
			id: componentID,
			/** The details of MCU and different sample precision is,
			 * according to a remark under Figure 13 in 4.8.1,
			 * described in Annex A.
			 *
			 * However, most raw images should use 1.
			 */
			horizontalSampleFactor,
			verticalSampleFactor,
		});
	}

	return {
		lines,
		samplesPerLine,
		components,
	};
}

export function decodeLosslessDHT(dht: Uint8Array): { table: HuffmanTable<U8>, id: number } {
	const scanner = new Scanner(dht, "big-endian");
	const length = scanner.u16();
	if (length !== dht.length) {
		throw new JPEGError("invalid DHT array");
	}
	const meta = scanner.u8();
	const tableClass = (meta & 0b1111_0000) >> 4;
	if (tableClass !== 0) {
		throw new JPEGError("expected DHT tableClass (Th) to be 0 (lossless)");
	}
	const tableIdentifier = meta & 0b1111;

	const countByBit = [];
	for (let i = 1; i <= 16; i++) {
		const n = scanner.u8();
		if (n >= 2 ** i) {
			throw new JPEGError(
				`invalid L_${i}; must be at most ${2 ** i} but was ${n}`,
			);
		}
		countByBit.push(n);
	}

	const pairs = [];
	let prefix = 0;
	for (let bits = 1; bits <= 16; bits++) {
		for (let k = 0; k < countByBit[bits - 1]; k++) {
			const value = scanner.u8();
			pairs.push({
				msbAlignedCode: prefix << (16 - bits),
				bits,
				value,
			});
			prefix += 1;
		}
		prefix = prefix << 1;
	}

	return {
		id: tableIdentifier,
		table: new HuffmanTable(pairs),
	};
}

export type SOSHeader = {
	components: { id: number, dcTable: number }[],
	/** See Table H.1 */
	predictor: number,
	/** See H.2.2 */
	pointTransform: number,
};

/** See B.2.3 Scan header syntax */
export function decodeLosslessStartOfScanHeader(sos: Uint8Array): SOSHeader {
	const scanner = new Scanner(sos, "big-endian");
	const headerSize = scanner.u16();
	const componentCount = scanner.u8();
	if (componentCount < 1 || componentCount > 4) {
		throw new JPEGError(
			`decodeLosslessStartOfScan: invalid componentCount ${componentCount}`,
		);
	} else if (headerSize !== 6 + 2 * componentCount) {
		throw new JPEGError(
			`decodeLosslessStartOfScan: invalid header size (Ls); expected 6 + 2*${componentCount} but got ${headerSize}`,
		);
	}

	const components = [];
	for (let k = 0; k < componentCount; k++) {
		const id = scanner.u8();
		const meta = scanner.u8();
		const dcTable = (meta & 0b1111_0000) >> 4;
		const acTable = meta & 0b0000_1111;
		if (acTable !== 0) {
			throw new JPEGError(
				`decodeLosslessStartOfScan: invalid Td_${k + 1} ${acTable}, expected 0 for lossless scan`,
			);
		}

		components.push({
			id,
			dcTable,
		});
	}

	const predictor = scanner.u8();
	if (predictor > 8) {
		throw new JPEGError(
			`decodeLosslessStartOfScan: unsupported predictor (Ss) value ${predictor} for lossless mode`,
		);
	}
	const spectralEnd = scanner.u8();
	if (spectralEnd !== 0) {
		throw new JPEGError(
			`decodeLosslessStartOfScan: unsupported spectral end (Se) value ${spectralEnd}; expected 0 for lossless mode`,
		);
	}
	const approximant = scanner.u8();
	const approximantHigh = (approximant & 0b1111_0000) >> 4;
	if (approximantHigh !== 0) {
		throw new JPEGError(
			`decodeLosslessStartOfScan: expected Ah to be 0 for lossless`,
		);
	}

	const pointTransform = approximant & 0b0000_1111;

	return {
		components,

		/** See Table H.1 */
		predictor,
		/** See H.2.2 */
		pointTransform,
	};
}

/**
 * Each code-word in a (lossless) Huffman entropy-coded segment is formed by a
 * Huffman-coded SSSS category (0 to 16, inclusive).
 *
 * An SSSS category with a value `b` is then followed by `b` bits indicating the
 * actual difference value. For example,
 *
 *     [SSSS=2] -3 -> 00b, -2 -> 01b; 2 -> 10b, 3 -> 11b
 *     [SSSS=3] -7 -> 000b, ..., -4 -> 011b; 4 -> 100b, ..., 7 -> 111b
 *
 * Except for category 16, which is not followed by a value (except in an Adobe
 * errata)
 */
export function decodeDifferenceMagnitude(ssss: number, value: U16) {
	if (ssss === 0) {
		return 0;
	} else if (ssss === 16) {
		// TODO: Handle Adobe errata?
		return 32768;
	}
	// set of values in this category are
	// [-2^ssss + 1, ..., -2^(ssss-1)] ++ [2^(ssss-1), ..., 2^ssss - 1]
	// which are encoded as
	// [0, ..., 2^(ssss-1) - 1], [2^(ssss-1), ...]
	if (value >= (1 << (ssss - 1))) {
		return value;
	}
	return value + (-(1 << ssss) + 1);
}

{
	assert(decodeDifferenceMagnitude(3, parseInt("000", 2)), "is equal to", -7);
	assert(decodeDifferenceMagnitude(3, parseInt("001", 2)), "is equal to", -6);
	assert(decodeDifferenceMagnitude(3, parseInt("010", 2)), "is equal to", -5);
	assert(decodeDifferenceMagnitude(3, parseInt("011", 2)), "is equal to", -4);

	assert(decodeDifferenceMagnitude(3, parseInt("100", 2)), "is equal to", 4);
	assert(decodeDifferenceMagnitude(3, parseInt("101", 2)), "is equal to", 5);
	assert(decodeDifferenceMagnitude(3, parseInt("110", 2)), "is equal to", 6);
	assert(decodeDifferenceMagnitude(3, parseInt("111", 2)), "is equal to", 7);
}

export function decodeSOF3HuffmanCodedScanDifferences(
	sof3Header: SOF3Header,
	sosHeader: SOSHeader,
	dhts: {
		table: HuffmanTable<U8>;
		id: number;
	}[],
	unstuffedData: Uint8Array,
): { id: number, diffRows: number[][], dx: number, dy: number }[] {
	const components: {
		id: number,
		diffRows: number[][],
		dx: number,
		dy: number,
	}[] = [];
	const mcu = [];
	for (const component of sosHeader.components) {
		const sof3Component = sof3Header.components.find(x => x.id === component.id);
		if (!sof3Component) {
			throw new JPEGError(
				`decodeSOF3HuffmanCodedScanData: component ${component.id} does not exist in SOS header;` +
				`\n\tavailable are [${sosHeader.components.map(x => x.id).join(", ")}]`
			);
		} else if (sof3Component.horizontalSampleFactor !== 1 || sof3Component.verticalSampleFactor !== 1) {
			throw new JPEGError(
				`decodeSOF3HuffmanCodedScanData: only supports sample factor 1`,
			);
		}

		const dht = dhts.find(x => x.id === component.dcTable);
		if (!dht) {
			throw new JPEGError(
				`decodeSOF3HuffmanCodedScanData: no DHT table ${component.dcTable} is not defined;` +
				`\n\tavailable are [${dhts.map(x => x.id).join(", ")}]`,
			);
		}

		// Exactly 1 per MCU because other sample factors are not currently supported
		mcu.push({
			componentID: component.id,
			componentOffset: sosHeader.components.indexOf(component),
			dht: dht.table,
		});
		components.push({
			id: component.id,
			diffRows: [],
			dx: sof3Component.horizontalSampleFactor,
			dy: sof3Component.verticalSampleFactor,
		});
	}

	// F.1.2.1.1 describes the structure of each component.
	const stream = new BitStream(unstuffedData);
	for (let y = 0; y < sof3Header.lines; y++) {
		for (let k = 0; k < components.length; k++) {
			components[k].diffRows.push([]);
		}

		for (let x = 0; x < sof3Header.samplesPerLine; x++) {
			for (let k = 0; k < mcu.length; k++) {
				const ssss = mcu[k].dht.decode(stream);
				let after = -1;
				if (ssss !== 0 && ssss !== 16) {
					// TODO: Adobe errata?
					after = stream.peek16BigEndian() >> (16 - ssss);
					stream.advanceBits(ssss);
				}
				const c = components[mcu[k].componentOffset]
				const diff = decodeDifferenceMagnitude(ssss, after);
				c.diffRows[c.diffRows.length - 1].push(diff);
			}
		}
	}
	return components;
}

export function applyLosslessPredictor(
	sosHeader: SOSHeader,
	{ diffRows }: { diffRows: number[][] },
): number[][] {
	console.log("predictor:", sosHeader.predictor);
	console.log("pointTransform:", sosHeader.pointTransform);
	const out: number[][] = [];

	for (let y = 0; y < diffRows.length; y++) {
		out[y] = [];
		let left = y === 0
			// On the first row, uses 2**(P-1).
			? 2 ** (15 - sosHeader.pointTransform)
			// On subsequent rows, uses the pixel above
			: out[y - 1][0];
		for (let x = 0; x < diffRows[y].length; x++) {
			// (assume sosHeader.predictor === 1)
			let prediction = left;
			if (y !== 0 && sosHeader.predictor !== 1) {
				if (sosHeader.predictor === 2) {
					prediction = out[y - 1][x];
				}
				// TODO: Other predictions
			}

			const actual = (prediction + diffRows[y][x]) & ((1 << 16) - 1);
			left = (out[y][x] = actual);
		}
	}

	return out;
}

function length16PrefixedSlice(scanner: Scanner): Uint8Array {
	const offset = scanner.offset;
	const byteCount = scanner.u16();
	const slice = scanner.getSlice({
		offset,
		byteCount,
	});
	scanner.offset = offset + byteCount;
	return slice;
}

function stuffedEntropySlice(scanner: Scanner): U8[] {
	const out: U8[] = [];
	let followsFF = false;
	while (true) {
		const byte = scanner.u8();
		if (followsFF) {
			if (byte === 0x00) {
				out.push(0xFF);
				followsFF = false;
			} else if (byte === 0xFF) {
				continue;
			} else {
				scanner.offset -= 2;
				break;
			}
		} else {
			if (byte === 0xFF) {
				followsFF = true;
			} else {
				out.push(byte);
			}
		}
	}

	return out;
}

export function decodeJPEG(jpeg: Uint8Array) {
	// This function supports only a very limited number of formats, which are
	// the most likely to be used in a DNG.
	// SOI*: 0xFF 0xD8
	// SOF3 (lossless, sequential): 0xFF 0xC3
	// SOF3 frame header (length-prefixed)
	// DHT: 0xFF 0xC4
	// DHT header (length-prefixed)
	// (more than one DHT table is expected)
	// SOS: 0xFF 0xDA
	// SOS scan header (length-prefixed)
	// (entropy coded data; does not currently support RST* markers)
	// EOI*: 0xFF 0xD9

	// Example:
	// M[d8: SOI*] M[c3: SOF3] 14 M[c4: DHT] 28 M[c4: DHT] 28 M[da: SOS] 27663 M[d9: EOI*]
	const scanner = new Scanner(jpeg, "big-endian");
	const soiMarker = scanner.u16();
	if (soiMarker !== 0xFF_D8) {
		throw new JPEGError(
			`decodeJPEG: Expected SOI* marker 0xFF_D8 at offset 0, but got 0x${soiMarker.toString(16).padStart(4, "0")}`,
		);
	}

	const sof3Marker = scanner.u16();
	if (sof3Marker !== 0xFF_C3) {
		throw new JPEGError(
			`decodeJPEG: Expected SOF3 marker 0xFF_C3 at offset 2`,
		);
	}
	const sof3Header = decodeSof3FrameHeader(length16PrefixedSlice(scanner));

	const dhts = [];
	while (true) {
		const marker = scanner.u16();
		if (marker === 0xFF_C4) {
			// DHT
			dhts.push(decodeLosslessDHT(length16PrefixedSlice(scanner)));
		} else if (marker === 0xFF_DA) {
			// SOS
			break;
		} else {
			throw new JPEGError(
				`decodeJPEG: Unsupported marker 0x${marker.toString(16).padStart(4, "0")} at offset ${scanner.offset - 2}`,
			);
		}
	}

	const sosHeader = decodeLosslessStartOfScanHeader(length16PrefixedSlice(scanner));
	const sosData = new Uint8Array(stuffedEntropySlice(scanner));

	const eoi = scanner.u16();
	if (eoi !== 0xFF_D9) {
		throw new JPEGError(
			`decodeJPEG: Expected EOI* marker at ${scanner.offset - 2} but got 0x${eoi.toString(16).padStart(4, "0")}`,
		);
	}

	const differences = decodeSOF3HuffmanCodedScanDifferences(
		sof3Header,
		sosHeader,
		dhts,
		sosData,
	);
	return {
		differences,
		sof3Header,
		sosHeader,
	};

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
	//     [0, 28], [1=0000_0001b], [1, 1, 1, 1; 1, 1, 1, 1; 1, 0, 0, 0; 0, 0, 0, 0], [0, 2, 3, 1, 4, 11, 10, 5, 15]
	// ]
	// 0xFFDA (SOS) @ 78
	// Uint8Array(27663) [
	//     [0, 10], [2   ], [0    ], [0               ], [1    ], [16 = 0000_1000b ], [1   ], [0   ], [0         ],
	//     [Ls=10], [Ns=2]  [Cs1=0], [Td1 = 0, Ta1 = 0], [Cs2=1], [Td2=0, Ta2=1000b], [Ss=1], [Se=0], [Ah=0, Al=0]
	// // 255, 0, 4, 3, 255, 0,
	//     4,   7, 195, 205, 182, 188, 239,  39,
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
}
