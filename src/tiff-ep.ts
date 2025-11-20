import { U16, U32, Scanner, ScannerError } from "./data.js";
import { TIFF6_TAG_VALUES } from "./tiff6.js";

export type ImageFileDirectory = {
  entryCount: U16;
  entries: IFDEntry[];
  nextDirectory: U32;
  myOffset: U32;
  parentOffset: U32;

  scanner: Scanner;
};

export type FieldType = U16;

export type IFDEntry = {
  tag: U16;
  fieldType: FieldType;
  valueCount: U32;
  inlineOffset: U32;
  valueOffset: U32;
};

// From 4.1.2, Image File Directory
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

export const TIFF_EP_TAGS = {
  // From TIFF-EP section 5.2.5
  330: {
    name: "SubIFDs",
    type: "U32",
    // count: number of child IFDs
    // If n = 1, the offset is the offset of the child IFD.
    // If n > 1, the offset is to an array of U32s.
  },
};
export const TIFF_EP_TAG_VALUES = Object.fromEntries(
  Object.entries(TIFF_EP_TAGS).map(([key, value]) => {
    return [value.name, parseInt(key)];
  })
) as any as {
  [K in keyof typeof TIFF_EP_TAGS as (typeof TIFF_EP_TAGS)[K]["name"]]: K;
};

export const FIELD_TYPES: Record<
  number,
  (typeof FIELD_INT_TYPES & typeof FIELD_OTHER_TYPES)[
    | keyof typeof FIELD_INT_TYPES
    | keyof typeof FIELD_OTHER_TYPES]
> = {
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

export function scanIFD(
  scanner: Scanner,
  parentOffset: U32
): ImageFileDirectory {
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
    scanner,
  };
}

export function readASCII(
  scanner: Scanner,
  entry: IFDEntry
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
  entry: IFDEntry
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
  entry: IFDEntry
): number[] | undefined {
  const fieldInfo = FIELD_TYPES[entry.fieldType];
  if (!fieldInfo || !("real" in fieldInfo) || !fieldInfo.real) {
    if ("int" in fieldInfo && fieldInfo.int) {
      return readInts(scanner, entry);
    }
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

export type ImageSegment =
  | {
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      offset: number;
      byteCount: number;
    }
  | {
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      offset: number;
      byteCount: number;
      tileWidth: number[];
      tileLength: number[];
    };

export function readImageSegments(ifd: ImageFileDirectory): ImageSegment[] {
  const imageWidth = readTag(ifd, TIFF6_TAG_VALUES.ImageWidth, readInts)![0];
  const imageLength = readTag(ifd, TIFF6_TAG_VALUES.ImageLength, readInts)![0];

  const rowsPerStrip = readTag(ifd, TIFF6_TAG_VALUES.RowsPerStrip, readInts);
  if (rowsPerStrip && rowsPerStrip.length === 1) {
    const stripOffsets = readTag(ifd, TIFF6_TAG_VALUES.StripOffsets, readInts);
    const stripByteCounts = readTag(
      ifd,
      TIFF6_TAG_VALUES.StripByteCounts,
      readInts
    );
    if (
      !stripOffsets ||
      !stripByteCounts ||
      stripOffsets.length !== stripByteCounts.length
    ) {
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

  const tileWidth = readTag(ifd, TIFF6_TAG_VALUES.TileWidth, readInts);
  const tileLength = readTag(ifd, TIFF6_TAG_VALUES.TileLength, readInts);
  if (
    tileWidth &&
    tileWidth.length === 1 &&
    tileLength &&
    tileLength.length === 1
  ) {
    const tileOffsets = readTag(ifd, TIFF6_TAG_VALUES.TileOffsets, readInts);
    const tileByteCounts = readTag(
      ifd,
      TIFF6_TAG_VALUES.TileByteCounts,
      readInts
    );
    if (
      !tileOffsets ||
      !tileByteCounts ||
      tileOffsets.length !== tileByteCounts.length
    ) {
      throw new ScannerError("invalid TileOffsets / TileByteCounts");
    }

    const tiles = [];
    const tilesAcross = Math.floor(
      (imageWidth + tileWidth[0] - 1) / tileWidth[0]
    );
    const tilesDown = Math.floor(
      (imageLength + tileLength[0] - 1) / tileLength[0]
    );
    let i = 0;
    for (let v = 0; v < tilesDown; v++) {
      for (let u = 0; u < tilesAcross; u++) {
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

export function readTag<T>(
  ifd: ImageFileDirectory,
  tag: number,
  f: (scanner: Scanner, entry: IFDEntry) => T
): T | undefined {
  const entry = ifd.entries.find((x) => x.tag === tag);
  if (!entry) {
    return;
  }

  return f(ifd.scanner, entry);
}

export function parseTIFF_EP(
  file: Uint8Array,
  options?: {
    fallbackByteOrder?: "little-endian" | "big-endian";
  }
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
        `\nFalling back to ${fallback}`
    );
    scanner.byteOrder = fallback;
  }

  const tiffMarker = scanner.u16();
  if (tiffMarker !== 42) {
    problems.push(
      `unexpected TIFF version at offset 2: ${tiffMarker} (expected 42)`
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

    const subIFDOffsets = readTag(
      imageFileDirectory,
      TIFF_EP_TAG_VALUES.SubIFDs,
      readInts
    );
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

  if (ifds.length > 100) {
    problems.push("too many IFDs!");
  }

  return {
    byteOrder: scanner.byteOrder!,
    ifds,
    problems,
    scanner,
  };
}
