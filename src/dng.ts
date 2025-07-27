import { I32, mod } from "./data.js";
import * as tiffEp from "./tiff-ep.js";
import { TIFF6_TAG_VALUES } from "./tiff6.js";

export const DNG_TAGS = {
	50706: {
		name: "DNGVersion",
		type: "U8",
		count: 4,
	},
	50707: {
		name: "DNGBackwardVersion",
		type: "U8",
		count: 4,
		// default: [DNGVersion[0], DNGVersion[1], 0, 0]
	},
	50708: {
		name: "UniqueCameraModel",
		type: "ASCII",
	},
	50709: {
		name: "LocalizedCameraModel",
		type: ["ASCII", "U8"],
		// default: UniqueCameraModel
	},
	50710: {
		name: "CFAPlaneColor",
		type: "U8",
		// Maps between the CFAPattern and plane numbers in
		// LinearRaw spaw.
		// default: [0, 1, 2] (RGB)
	},
	50711: {
		name: "CFALayout",
		type: "U16",
		count: 1,
		// default: 1 (Rectangular)
		// 1: Rectangular
		// 2: Staggered A (even columns are offset down 1/2 row)
		// 3: Staggered B (even columns are offset up 1/2 row)
		// 4: Staggered C
		// 5: Staggered D
		// Added in 1.3.0.0:
		// 6: Staggered E
		// 7: Staggered F
		// 8: Staggered G
		// 9: Staggered H
		// "even" counts the first row/column as 1 and thus odd.
	},
	50712: {
		name: "LinearizationTable",
		type: "U16",
		// default: identity table (???)
	},
	50713: {
		name: "BlackLevelRepeatDim",
		type: "U16",
		count: 2,
		// [BlackLevelRepeatRows, BlackLevelRepeatCols]
		// default: [1, 1]
	},
	50714: {
		name: "BlackLevel",
		type: ["U16", "U32", "Rational"],
		// count: BlackLevelRepeatRows * BlackLevelRepeatCols * SamplesPerPixel
		// default: 0
	},
	50715: {
		name: "BlackLevelDeltaH",
		type: "SRational",
		// count: ActiveArea width
		// default: [0, ...]
	},
	50716: {
		name: "BlackLevelDeltaV",
		type: "SRational",
		// count: ActiveArea length
		// default: [0, ...]
	},
	50717: {
		name: "WhiteLevel",
		type: ["U16", "U32"],
		// count: SamplesPerPixel
		// default: 2^BitsPerSample - 1 (integral) or 1.0 (floating point)
	},
	50718: {
		name: "DefaultScale",
		type: "Rational",
		// default: [1.0, 1.0]
		// The scale factor for non-square pixels.
	},
	50780: {
		name: "BestQualityScale",
		type: "Rational",
		// default: 1.0
		// The amount to scale the DefaultScale to achieve the highest
		// possible quality
	},

	// ...

	50721: {
		name: "ColorMatrix1",
		type: "SRational",
		// count: ColorPlanes * 3
	},
	50722: {
		name: "ColorMatrix2",
		type: "SRational",
		// count: ColorPlanes * 3
	},
	50723: {
		name: "CameraCalibration1",
		type: "SRational",
		// count: ColorPlanes * ColorPlanes
		//default: Identity
	},
	50724: {
		name: "CameraCalibration2",
		type: "SRational",
		// count: ColorPlanes * ColorPlanes
		// default: Identity
	},
	50727: {
		name: "AnalogBalance",
		type: "Rational",
		// count: ColorPlanes
		// default: [1.0, 1.0, ...]
	},
	50728: {
		name: "AsShotNeutral",
		type: ["U16", "Rational"],
		// count: ColorPlanes
	},
	50729: {
		name: "AsShotWhiteXY",
		type: "Rational",
		count: 2,
	},
	50730: {
		name: "BaselineExposure",
		type: "SRational",
		count: 1,
		// default: 0.0
	},
	50731: {
		name: "BaselineNoise",
		type: "Rational",
		count: 1,
		// default: 1.0
	},
	50732: {
		name: "BaselineSharpness",
		type: "Rational",
		count: 1,
		// default: 1.0
	},
	50734: {
		name: "LinearResponseLimit",
		type: "Rational",
		count: 1,
		// default: 1.0
	},
	50739: {
		name: "ShadowScale",
		type: "Rational",
		count: 1,
		// default: 1.0
	},
	50741: {
		name: "MakerNoteSafety",
		type: "U16",
		count: 1,
	},
	50778: {
		name: "CalibrationIlluminant1",
		type: "U16",
		count: 1,
		// default 0 (unknown)
	},
	50779: {
		name: "CalibrationIlluminant2",
		type: "U16",
		count: 1,
	},
	50781: {
		name: "RawDataUniqueID",
		type: "U8",
		count: 16,
	},
	50931: {
		name: "CameraCalibrationSignature",
		type: ["U8", "ASCII"],
		// default: ""
	},
	50932: {
		name: "ProfileCalibrationSignature",
		type: ["U8", "ASCII"],
		// default: ""
	},
	50933: {
		name: "ExtraCameraProfiles",
		type: "U32",
		// count: number of extra camera profiels
		// default: []
	},
	50936: {
		name: "ProfileName",
		type: ["U8", "ASCII"],
	},
	50937: {
		name: "ProfileHueSatMapDims",
		type: "U32",
		count: 3,
		// value: [HueDivisions, SaturationDivisions, ValueDivisions]
	},
	50938: {
		name: "ProfileHueSatMapData1",
		type: "F32",
		// count: HueDivisions * SaturationDivisions * ValueDivisions * 3
	},
	50939: {
		name: "ProfileHueSatMapData2",
		type: "F32",
		// count: HueDivisions * SaturationDivisions * ValueDivisions * 3
	},
	50940: {
		name: "ProfileToneCurve",
		type: "F32",
		// count: Samples * 2
	},
	50941: {
		name: "ProfileEmbedPolicy",
		type: "U32",
		count: 1,
		// default: 0,
	},
	50964: {
		name: "ForwardMatrix1",
		type: "SRational",
		// count: 3 * ColorPlanes
	},
	50965: {
		name: "ForwardMatrix2",
		type: "SRational",
		// count: 3 * ColorPlanes
	},
	50981: {
		name: "ProfileLookTableDims",
		type: "U32",
		count: 3,
		// value: [HueDivisions >= 1, SaturationDivisions >= 2, ValueDivisions >= 1]
	},
	50982: {
		name: "ProfileLookTableData",
		type: "F32",
		// count: HueDivisions * SaturationDivisions * ValueDivisions * 3
	},
	51041: {
		name: "NoiseProfile",
		type: "F64",
		// count: 2, or 2 * ColorPlanes
	},
	51110: {
		name: "DefaultBlackRender",
		type: "U32",
		count: 1,
		// default: 0 (Auto)
		// 1: None
	},
	51111: {
		name: "NewRawImageDigest",
		type: "U8",
		count: 16,
	},
	50719: {
		name: "DefaultCropOrigin",
		type: ["U16", "U32", "Rational"],
		count: 2,
		// [DefaultCropOriginH, DefaultCropOriginV]
		// default: [0, 0]
	},
	50720: {
		name: "DefaultCropSize",
		type: ["U16", "U32", "Rational"],
		count: 2,
		// value: [DefaultCropSizeH, DefaultCropSizeV]
		// default: [ImageWidth, ImageLength]
	},
	50733: {
		name: "BayerGreenSplit",
		type: "U32",
		count: 1,
		// default: 0
	},
	50738: {
		name: "AntiAliasStrength",
		type: "Rational",
		// default: 1.0
	},
	50829: {
		name: "ActiveArea",
		type: ["U16", "U32"],
		count: 4,
		// default: [0, 0, ImageLength, ImageWidth]
	},
	51009: {
		name: "OpcodeList2",
		type: "Undefined",
		// default: []
	},
	51022: {
		name: "OpcodeList3",
		type: "Undefined",
		// default: []
	},
	52525: {
		// Added in 1.6.0.0
		name: "ProfileGainTableMap",
		type: "Undefined",
		// count: Byte count of data
	},
	// From TIFF-EP 5.2.45
	34853: {
		name: "GPSInfo",
		type: "U32",
		count: 1,
		// Offset to GPSInfo IFD
	},
	// From TIFF-EP section 5.2.17
	33421: {
		name: "CFARepeatPatternDim",
		type: "U16",
		count: 2,
		// value: [CFARepeatRows, CFARepeatCols]
	},
	// TIFF-EP 5.2.18
	33422: {
		name: "CFAPattern",
		type: "U8",
		// count: CFARepeatRows * CFARepeatCols
	},
} as const;

export const DNG_TAG_VALUES = Object.fromEntries(
	Object.entries(DNG_TAGS).map(([key, value]) => {
		return [value.name, parseInt(key)];
	})
) as any as {
		[K in keyof typeof DNG_TAGS as (typeof DNG_TAGS)[K]["name"]]: K
	};


export class DNGError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export class ActiveArea {
	/** ImageLength */
	readonly imageHeight: number;
	/** ImageWidth */
	readonly imageWidth: number;

	/** ActiveArea[0] */
	readonly activeAreaTop: number;
	/** ActiveArea[1] */
	readonly activeAreaLeft: number;
	/** ActiveArea[2] */
	readonly activeAreaBottom: number;
	/** ActiveArea[3] */
	readonly activeAreaRight: number;

	readonly activeAreaWidth: number;
	readonly activeAreaHeight: number;

	constructor(private ifd: tiffEp.ImageFileDirectory) {
		this.imageHeight = readRealsTagExpectingSize(ifd, "ImageLength", 1, { requires: isPositive })[0];
		this.imageWidth = readRealsTagExpectingSize(ifd, "ImageWidth", 1, { requires: isPositive })[0];

		const activeArea = tiffEp.readTag(ifd, DNG_TAG_VALUES.ActiveArea, tiffEp.readInts)
			|| [0, 0, this.imageHeight, this.imageWidth];
		if (activeArea.length !== 4) {
			throw new DNGError("invalid ActiveArea");
		}
		this.activeAreaTop = activeArea[0];
		this.activeAreaLeft = activeArea[1];
		this.activeAreaBottom = activeArea[2];
		this.activeAreaRight = activeArea[3];
		this.activeAreaWidth = this.activeAreaRight - this.activeAreaLeft;
		this.activeAreaHeight = this.activeAreaBottom - this.activeAreaTop;
	}
}

export class ActiveAreaPattern {
	public readonly patternWidth: number;
	public readonly patternHeight: number;
	constructor(
		public readonly activeArea: ActiveArea,
		private pattern: number[][],
	) {
		this.patternHeight = pattern.length;
		this.patternWidth = pattern[0].length;
	}

	getPixel(row: number, column: number): number {
		const [u, v] = this.patternIndex(row, column);
		return this.pattern[u][v];
	}

	patternIndex(row: number, column: number) {
		const u = mod(row - this.activeArea.activeAreaLeft, this.pattern.length);
		const v = mod(column - this.activeArea.activeAreaTop, this.pattern[0].length);
		return [u, v];
	}
}


export function isPositive(x: number) {
	return x > 0;
}

export const ALL_TAG_VALUES = {
	...DNG_TAG_VALUES,
	...TIFF6_TAG_VALUES,
};

export function readRealsTagExpectingSize(
	ifd: tiffEp.ImageFileDirectory,
	tagName: keyof typeof ALL_TAG_VALUES,
	expectedSize: number,
	options?: { default?: number, requires?: (v: I32) => boolean },
): I32[] {
	const reals = tiffEp.readTag(ifd, ALL_TAG_VALUES[tagName], tiffEp.readReals);
	if (reals === undefined) {
		const def = options?.default;
		if (def === undefined) {
			throw new DNGError(`${tagName} is required`);
		}

		const defs = [];
		for (let i = 0; i < expectedSize; i++) {
			defs.push(def);
		}
		return defs;
	} else if (reals.length !== expectedSize) {
		throw new DNGError(`${tagName} has invalid size ${reals.length}; expected ${expectedSize}`);
	}
	if (options?.requires) {
		for (const v of reals) {
			if (!options.requires(v)) {
				throw new DNGError(`${tagName} has invalid value ${v}`);
			}
		}
	}
	return reals;
}

export function readRealRectangles<C extends number>(
	ifd: tiffEp.ImageFileDirectory,
	tagName: keyof typeof ALL_TAG_VALUES,
	dimensions: C extends 2 ? [number, number] : [number, number, number],
	options?: { default?: number; requires?: (v: I32) => boolean; },
): C extends 2 ? number[][] : number[][][] {
	if (dimensions.length === 2) {
		const count = dimensions[0] * dimensions[1];
		const reals = readRealsTagExpectingSize(ifd, tagName, count, options);
		const out: number[][] = [];
		for (let x = 0; x < dimensions[0]; x++) {
			out[x] = [];
			for (let y = 0; y < dimensions[1]; y++) {
				out[x][y] = reals[x * dimensions[1] + y];
			}
		}
		return (out as number[][]) as any;
	} else {
		const count = dimensions[0] * dimensions[1] * dimensions[2];
		const reals = readRealsTagExpectingSize(ifd, tagName, count, options);
		const out: number[][][] = [];
		for (let x = 0; x < dimensions[0]; x++) {
			out[x] = [];
			for (let y = 0; y < dimensions[1]; y++) {
				out[x][y] = [];
				for (let z = 0; z < dimensions[2]; z++) {
					const i = (x * dimensions[1] + y) * dimensions[2] + z;
					out[x][y][z] = reals[i];
				}
			}
		}
		return out as number[][][] as any;
	}
}
