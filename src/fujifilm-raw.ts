import { Scanner, U16 } from "./data.js";
import { FileFormatDetectionError } from "./errs.js";
import { parseTIFF_EP, readInts, readTag, scanIFD } from "./tiff-ep.js";

export const FUJI_MAGIC_STRING = "FUJIFILMCCD-RAW 0201";

export const FUJIFILM_TIFF_TAGS = {
	61448: {
		name: "FF_pixelData",
		type: "???",
	},
};

// https://libopenraw.freedesktop.org/formats/raf/
export function decodeFujifilmRAF(file: Uint8Array) {
	const scanner = new Scanner(file, "big-endian");
	const magicString = scanner.utf8(FUJI_MAGIC_STRING.length);
	if (magicString !== FUJI_MAGIC_STRING) {
		throw new FileFormatDetectionError(`RAF: unexpected magic string ${JSON.stringify(magicString)}`);
	}

	const cameraID = scanner.utf8(8);
	const cameraName = scanner.utf8(32);

	console.log({ cameraID, cameraName });

	// 8 bytes of camera ID. e.g. "FF389501".
	// 32 bytes for the name of the camera, terminated with 0x00.
	const offsetDirectory = decodeOffsetDirectory(scanner);
	console.log({ offsetDirectory });

	scanner.offset = offsetDirectory.metaContainer.offset;
	const metaContainer = decodeMetaContainer(scanner);

	scanner.offset = offsetDirectory.cfa.offset;
	const tiffBytes = scanner.bytes(offsetDirectory.cfa.length);

	try {
		console.log("parsing tiff...");
		const parsed = parseTIFF_EP(tiffBytes);
		console.log(parsed);
		const dataIfdOffset = readTag(parsed.ifds[0], 0xF000, readInts);
		if (!dataIfdOffset || !dataIfdOffset[0]) {
			throw new FileFormatDetectionError("failed to find tag `0xF000` in IFD 0 of TIFF");
		}
		console.log({ offsetDirectory, dataIfdOffset });
		parsed.scanner.offset = dataIfdOffset[0];
		const ifd = scanIFD(parsed.scanner, 0);
		console.log(ifd);
	} catch (err) {
		throw new Error(`failed to read TIFF from ${JSON.stringify(offsetDirectory.cfa)}`, { cause: err });
	}

	console.log({ metaContainer });
}

function decodeOffsetDirectory(scanner: Scanner) {
	const directoryVersion = scanner.utf8(4);

	scanner.bytes(20);

	const jpegOffset = scanner.u32();
	const jpegLength = scanner.u32();
	const metaContainerOffset = scanner.u32();
	const metaContainerLength = scanner.u32();
	const cfaOffset = scanner.u32();
	const cfaLength = scanner.u32();

	scanner.bytes(16);

	// The CFA is a TIFF, apparently.
	return {
		directoryVersion,
		jpeg: { offset: jpegOffset, length: jpegLength },
		metaContainer: { offset: metaContainerOffset, length: metaContainerLength },
		cfa: { offset: cfaOffset, length: cfaLength },
	};
}

export type FujifilmContainer = {
	rawRecords: { tag: U16, value: Uint8Array }[],
	/**
	 * tag 256 (0x100)
	 *
	 * @example [16, 86, 24, 240] represents
	 *   16*256+86 = 4182 tall, by 24*256+240 = 6384 wide.
	 */
	sensorDimensions?: {
		rows: number,
		columns: number,
	},

	/**
	 * tag 272 (0x110)
	 * @example [0, 13, 0, 6] represents { "top": 13, "left": 6}
	 */
	activeAreaTopLeft?: {
		left: number,
		top: number,
	},

	/**
	 * tag 273 (0x111)
	 */
	activeAreaDimensions?: {
		rows: number,
		columns: number,
	},

	/**
	 * tag ??? (0x121)
	 */
	outputDimensions?: {
		rows: number,
		columns: number,
	},

	/**
	 * tag ??? (0x131)
	 *
	 * An array of 0 | 1 | 2.
	 */
	cfaPattern?: Uint8Array,
};

function decodeMetaContainer(scanner: Scanner): FujifilmContainer {
	scanner.byteOrder = "big-endian";

	const recordCount = scanner.u32();
	const rawRecords = [];
	for (let i = 0; i < recordCount; i++) {
		const tag = scanner.u16();
		const sizeBytes = scanner.u16();
		const value = scanner.bytes(sizeBytes);
		rawRecords.push({ tag, value });
	}

	const container: FujifilmContainer = {
		rawRecords,
	};
	for (const { tag, value } of rawRecords) {
		if (tag === 0x100) {
			const rows = value[0] * 256 + value[1];
			const columns = value[2] * 256 + value[3];
			container.sensorDimensions = { rows, columns };
		} else if (tag === 0x110) {
			const top = value[0] * 256 + value[1];
			const left = value[2] * 256 + value[3];
			container.activeAreaTopLeft = { top, left };
		} else if (tag === 0x111) {
			const rows = value[0] * 256 + value[1];
			const columns = value[2] * 256 + value[3];
			container.activeAreaDimensions = { rows, columns };
		} else if (tag === 0x121) {
			const rows = value[0] * 256 + value[1];
			const columns = value[2] * 256 + value[3];
			container.outputDimensions = { rows, columns };
		} else if (tag === 0x131) {
			container.cfaPattern = value;
		}
	}

	return container;
}
