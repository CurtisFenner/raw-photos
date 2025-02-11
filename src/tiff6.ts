export const TIFF6_TAGS = {
	254: {
		name: "NewSubfileType",
		type: "U32",
	},
	256: {
		name: "ImageWidth",
		type: ["U16", "U32"],
	},
	257: {
		name: "ImageLength",
		type: ["U16", "U32"],
	},
	258: {
		name: "BitsPerSample",
		type: "U16",
		// count: SamplesPerPixel
	},
	259: {
		name: "Compression",
		type: "U16",
		count: 1,
		// Controls how sample data pointer should be interpreted.
	},
	262: {
		name: "PhotometricInterpretation",
		type: "U16",
		// 0: WhiteIsZero
		// 1: BlackIsZero
	},
	271: {
		name: "Make",
		type: "ASCII",
	},
	272: {
		name: "Model",
		type: "ASCII",
	},
	273: {
		name: "StripOffsets",
		type: ["U16", "U32"],
		// The byte offset of each strip
	},
	274: {
		name: "Orientation",
		type: "U16",
		count: 1,
		// default: 1
	},
	277: {
		name: "SamplesPerPixel",
		type: "U16",
	},
	278: {
		name: "RowsPerStrip",
		type: ["U16", "U32"],
	},
	279: {
		name: "StripByteCounts",
		type: ["U16", "U32"],
		// The size of each strip in bytes _after compression_.
	},
	284: {
		name: "PlanarConfiguration",
		type: "U16",
		count: 1,
		// default 1: Chunky (RGBRGBRGB...)
		// 2: Planar. Not in widespread use.
	},
	305: {
		name: "Software",
		type: "ASCII",
	},
	306: {
		name: "DateTime",
		type: "ASCII",
		count: 20,
	},
	322: {
		name: "TileWidth",
		type: ["U16", "U32"],
		count: 1,
	},
	323: {
		name: "TileLength",
		type: ["U16", "U32"],
		count: 1,
	},
	324: {
		name: "TileOffsets",
		type: "U32",
		// count: TilesPerImage when PlanarConfiguration = 1
		// count: SamplesPerPixel * TilesPerImage for PlanarConfiguration = 2
	},
	325: {
		name: "TileByteCounts",
		type: ["U16", "U32"],
		// count: TileOffsets.count
	},
	529: {
		name: "YCbCrCoefficients",
		type: "Rational",
		count: 3,
	},
	530: {
		name: "YCbCrSubSampling",
		type: "U16",
		count: 2,
		// value: [YCbCrSubsampleHoriz, YCbCrSubsampleVert]
	},
	531: {
		name: "YCbCrPositioning",
		type: "U16",
		count: 1,
	},
	532: {
		name: "ReferenceBlackWhite",
		type: "Rational",
	},
} as const;
