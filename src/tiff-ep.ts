import { U16, U32, Scanner, ScannerError } from "./data.js";
import { DNG_TAG_VALUES } from "./dng.js";
import { TIFF6_TAG_VALUES } from "./tiff6.js";


export type ImageFileDirectory = {
	entryCount: U16,
	entries: IFDEntry[],
	nextDirectory: U32,
	myOffset: U32,
	parentOffset: U32,
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

export function scanIFD(scanner: Scanner, parentOffset: U32): ImageFileDirectory {
	const myOffset = scanner.offset;

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
		myOffset,
		parentOffset,
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

export function readImageSegments(
	scanner: Scanner,
	ifd: ImageFileDirectory,
) {
	const imageWidth = readTag(ifd, TIFF6_TAG_VALUES.ImageWidth, scanner, readInts)![0];
	const imageLength = readTag(ifd, TIFF6_TAG_VALUES.ImageLength, scanner, readInts)![0];

	const rowsPerStrip = readTag(ifd, TIFF6_TAG_VALUES.RowsPerStrip, scanner, readInts);
	if (rowsPerStrip && rowsPerStrip.length === 1) {
		const stripOffsets = readTag(ifd, TIFF6_TAG_VALUES.StripOffsets, scanner, readInts);
		const stripByteCounts = readTag(ifd, TIFF6_TAG_VALUES.StripByteCounts, scanner, readInts);
		if (!stripOffsets || !stripByteCounts || stripOffsets.length !== stripByteCounts.length) {
			throw new ScannerError("invalid StripOffsets / StripByteCounts");
		}

		const segments = [];
		for (let i = 0; i < stripOffsets.length; i++) {
			segments.push({
				x0: 0,
				x1: imageWidth,
				y0: i * rowsPerStrip[0],
				y1: Math.min((i + 1) * rowsPerStrip[0], imageLength),
				offset: stripOffsets[i],
				byteCount: stripByteCounts[i],
			});
		}
		return segments;
	}

	const tileWidth = readTag(ifd, TIFF6_TAG_VALUES.TileWidth, scanner, readInts);
	const tileLength = readTag(ifd, TIFF6_TAG_VALUES.TileLength, scanner, readInts);
	if (tileWidth && tileWidth.length === 1 && tileLength && tileLength.length === 1) {
		const tileOffsets = readTag(ifd, TIFF6_TAG_VALUES.TileOffsets, scanner, readInts);
		const tileByteCounts = readTag(ifd, TIFF6_TAG_VALUES.TileByteCounts, scanner, readInts);
		if (!tileOffsets || !tileByteCounts || tileOffsets.length !== tileByteCounts.length) {
			throw new ScannerError("invalid TileOffsets / TileByteCounts");
		}

		const tiles = [];
		const tilesAcross = Math.floor((imageWidth + tileWidth[0] - 1) / tileWidth[0]);
		const tilesDown = Math.floor((imageLength + tileLength[0] - 1) / tileLength[0]);
		let i = 0;
		for (let u = 0; u < tilesAcross; u++) {
			for (let v = 0; v < tilesDown; v++) {
				tiles.push({
					x0: u * tileWidth[0],
					x1: (u + 1) * tileWidth[0],
					y0: v * tileLength[0],
					y1: (v + 1) * tileLength[0],
					offset: tileOffsets[i],
					byteCount: tileByteCounts[i],
					tileWidth,
					tileLength,
				});
				i++;
			}
		}
		return tiles;
	}

	throw new Error("missing RowsPerStrip / TileWidth / TileLength");
}

export function readTag<T>(ifd: ImageFileDirectory, tag: number, scanner: Scanner, f: (scanner: Scanner, entry: IFDEntry) => T): T | undefined {
	const entry = ifd.entries.find(x => x.tag === tag);
	if (!entry) {
		return;
	}

	return f(scanner, entry);
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

	const unparsedIFDs = [{ childOffset: scanner.u32(), parentOffset: 0 }];

	const ifds = [];
	for (let k = 0; k < unparsedIFDs.length && ifds.length < 10_000; k++) {
		const { childOffset, parentOffset } = unparsedIFDs[k];
		if (childOffset === 0) {
			continue;
		}

		scanner.offset = childOffset;
		const imageFileDirectory = scanIFD(scanner, parentOffset);
		ifds.push(imageFileDirectory);

		const subIFDOffsets = readTag(imageFileDirectory, DNG_TAG_VALUES.SubIFDs, scanner, readInts);
		if (subIFDOffsets) {
			for (const offset of subIFDOffsets) {
				unparsedIFDs.push({
					childOffset: offset,
					parentOffset: childOffset,
				});
			}
		}

		unparsedIFDs.push({
			childOffset: imageFileDirectory.nextDirectory,
			parentOffset,
		});

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
