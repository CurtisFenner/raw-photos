import { diagonalMatrix as matrixWithDiagonal, matrixInverse, matrixMultiply, matrixToArray } from "./data.js";
import { readRealRectangles, readRealsTagExpectingSize } from "./dng.js";
import { ImageFileDirectory } from "./tiff-ep.js";

export type XYZ = {
	space: "XYZ",
	x: number,
	y: number,
	z: number,
};

export type Oklab = {
	space: "oklab",
	l: number,
	a: number,
	b: number,
};

/**
 * This space is not directly displayable, because each camera captures color
 * differently.
 */
export type CameraRGB = {
	space: "CameraRGB",
	red: number,
	green: number,
	blue: number,
};

export type LMS = {
	space: "lms",
	/** The long ("red") cone response */
	l: number,
	/** The medium ("green") cone response */
	m: number,
	/** The short ("blue") cone response */
	s: number,
};

// "Simple Analytic Approximations to the CIE XYZ Color Matching Functions"
// (2013)
// https://jcgt.org/published/0002/02/01/
export function standardObserver1964(wavelengthNm: number): XYZ {
	return {
		space: "XYZ",
		x: 0.398 * Math.exp(-1250 * Math.log((wavelengthNm + 570.01) / 1014) ** 2)
			+ 1.132 * Math.exp(-234 * Math.log((1338 - wavelengthNm) / 743.5) ** 2),
		y: 1.011 * Math.exp(-0.5 * ((wavelengthNm - 556.1) / 46.14) ** 2),
		z: 2.060 * Math.exp(-32 * Math.log((wavelengthNm - 265.8) / 180.4) ** 2),
	};
}

/**
 * https://bottosson.github.io/posts/oklab/
 *
 * Oklab uses the D64 whitepoint (also used by sRGB).
 */
export function convertXYZ(xyz: XYZ) {
	const lms: LMS = {
		space: "lms",
		l:
			xyz.x * 0.8189330101
			+ xyz.y * 0.3618667424
			+ xyz.z * -0.1288597137,
		m:
			xyz.x * 0.0329845436
			+ xyz.y * 0.9293118715
			+ xyz.z * 0.0361456387,
		s:
			xyz.x * 0.0482003018
			+ xyz.y * 0.2643662691
			+ xyz.z * 0.6338517070,
	};

	const lms2 = {
		l: Math.pow(lms.l, 1 / 3),
		m: Math.pow(lms.m, 1 / 3),
		s: Math.pow(lms.s, 1 / 3),
	};

	const oklab: Oklab = {
		space: "oklab",
		l:
			lms2.l * +0.2104542553
			+ lms2.m * +0.7936177850
			+ lms2.s * -0.0040720468,
		a:
			lms2.l * +1.9779984951
			+ lms2.m * -2.4285922050
			+ lms2.s * +0.4505937099,
		b:
			lms2.l * +0.0259040371
			+ lms2.m * +0.7827717662
			+ lms2.s * -0.8086757660,
	};

	return {
		xyz,
		lms,
		oklab,
	};
}

// McCamy (1992) https://doi.org/10.1002%2Fcol.5080170211
export function colorTemperatureKelvin({ x, y }: { x: number, y: number }): number {
	// (Formula copied from Wikipedia on 23 February 2025)
	const xe = 0.3320;
	const ye = 0.1858;
	const n = (x - xe) / (ye - y);
	return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

// https://doi.org/10.1364/JOSA.54.001031
// http://www.brucelindbloom.com/index.html?Eqn_DIlluminant.html
export function daylightXYZ(temperatureK: number, luminance: number): XYZ {
	// x = X/(X+Y+Z)
	// y = Y/(X+Y+Z)
	// z = 1 - x - y = Z/(X+Y+Z)
	let x: number;
	if (temperatureK <= 7000) {
		const t = Math.max(4000, temperatureK);
		x = -4.6070e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063;
	} else {
		const t = Math.min(25000, temperatureK);
		x = -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.237040;
	}
	const y = 2.870 * x - 3.000 * x ** 2 - 0.275;
	const z = 1 - x - y;

	// (X+Y+Z) = luminance / y
	// X = x * (X+Y+Z)
	// Y = y * (X+Y+Z)
	// Z = z * (X+Y+Z)
	return {
		space: "XYZ",
		x: luminance * x / y,
		y: luminance,
		z: luminance * z / y,
	};
}

/**
 * https://exiftool.org/TagNames/EXIF.html#LightSource
 * 0: Unknown
 * 1: Daylight
 * 2: Fluorescent
 * 3: Tungesten (Incandescent)
 * 4: Flash
 * 9: Fine Weather
 * 10: Cloudy
 * 11: Shade
 * 12: Daylight Fluorescent
 * 13: Day White Fluorescent
 * 14: Cool White Fluorescent
 * 15: White Fluorescent
 * 16: Warm White Fluorescent
 * 17: Standard Light A
 * 18: Standard Light B
 * 19: Standard Light C
 * 20: D55
 * 21: D65
 * 22: D75
 * 23: D50
 * 24: ISO Studio Tungesten
 * 255: Other
 */
const STANDARD_ILLUMINANTS: Record<number, {
	temperatureK: number,
	tri: XYZ,
}> = {
	/**
	 * Illuminant A. Standard tungsten incandescant bulb.
	 */
	17: {
		temperatureK: 2856,
		tri: {
			space: "XYZ",
			x: 109.85,
			y: 100,
			z: 35.58,
		},
	},
	/** D65. */
	21: {
		temperatureK: 6504,
		tri: {
			space: "XYZ",
			x: 95.047,
			y: 100,
			z: 108.883,
		},
	},
};

export class WhiteBalance {
	private colorMatrix: number[][];
	private forwardMatrix: number[][];
	private cameraCalibration: number[][];
	private analogBalance: number[];

	/** The neutral white balance in the linear space. */
	private asShotNeutral: number[];

	private xyzNeutral: XYZ;

	/**
	 * "AB * CC * CM"
	 * XYZ -> This CameraRGB (under illuminant)
	 */
	private xyzToCamera: number[][];

	/**
	 * This CameraRGB
	 */
	private cameraNeutral: CameraRGB;

	/** "ReferenceNeutral = (AB * CC)^-1 * CameraNeutral"
	 * Reference CameraRGB
	 */
	private referenceNeutral: CameraRGB;

	/** "D"
	 * Reference CameraRGB -> White-balanced CameraRGB
	 */
	private cameraWhiteBalancing: number[][];

	/**
	 * "CameraToXYZ_D50 = FM * D * (AB * CC)^-1"
	 * This CameraRGB -> XYZ_D50
	 *
	 * D: Reference CameraRGB -> White-balanced CameraRGB
	 */
	private cameraToXYZ_D50: number[][];

	constructor(ifd: ImageFileDirectory, flag: 1 | 2) {
		this.asShotNeutral = readRealsTagExpectingSize(ifd, "AsShotNeutral", 3);

		// XYZ -> Reference CameraRGB (under illuminant)
		this.colorMatrix = readRealRectangles<2>(ifd, `ColorMatrix${flag}`, [3, 3]);

		// White-balanced CameraRGB -> XYZ_D50
		this.forwardMatrix = readRealRectangles<2>(ifd, `ForwardMatrix${flag}`, [3, 3]);

		// Reference CameraRGB -> This CameraRGB (under illuminant)
		this.cameraCalibration = readRealRectangles<2>(ifd, `CameraCalibration${flag}`, [3, 3]);

		this.analogBalance = readRealsTagExpectingSize(ifd, "AnalogBalance", 3, { default: 1 });

		const calibrationIlluminant = readRealsTagExpectingSize(ifd, `CalibrationIlluminant${flag}`, 1)[0];
		const calibrationData = STANDARD_ILLUMINANTS[calibrationIlluminant];
		if (!calibrationData) {
			throw new Error(`unsupported calibration illuminant ${calibrationIlluminant}`);
		}
		this.xyzNeutral = daylightXYZ(calibrationData.temperatureK, 1);

		this.xyzToCamera = matrixMultiply(
			matrixWithDiagonal(this.analogBalance),
			matrixMultiply(
				this.cameraCalibration,
				this.colorMatrix,
			),
		);

		const cameraNeutral = matrixMultiply(
			this.xyzToCamera,
			[[this.xyzNeutral.x], [this.xyzNeutral.y], [this.xyzNeutral.z]],
		);
		this.cameraNeutral = {
			space: "CameraRGB",
			red: cameraNeutral[0][0],
			green: cameraNeutral[1][0],
			blue: cameraNeutral[2][0],
		};

		const referenceNeutral = matrixMultiply(
			matrixInverse(matrixMultiply(
				matrixWithDiagonal(this.analogBalance),
				this.cameraCalibration,
			)),
			cameraNeutral,
		);
		this.referenceNeutral = {
			space: "CameraRGB",
			red: referenceNeutral[0][0],
			green: referenceNeutral[1][0],
			blue: referenceNeutral[2][0],
		};

		this.cameraWhiteBalancing = matrixInverse(
			matrixWithDiagonal(
				[this.referenceNeutral.red, this.referenceNeutral.green, this.referenceNeutral.blue],
			),
		);

		this.cameraToXYZ_D50 = matrixMultiply(
			matrixMultiply(
				this.forwardMatrix,
				this.cameraWhiteBalancing,
			),
			matrixInverse(
				matrixMultiply(
					matrixWithDiagonal(this.analogBalance),
					this.cameraCalibration,
				),
			),
		);

		const colorMatrix1 = readRealRectangles<2>(ifd, "ColorMatrix1", [3, 3]);
		const illuminantID1 = readRealsTagExpectingSize(ifd, "CalibrationIlluminant1", 1)[0];
		const illuminant1 = STANDARD_ILLUMINANTS[illuminantID1];
		const colorMatrix2 = readRealRectangles<2>(ifd, "ColorMatrix2", [3, 3]);
		const illuminantID2 = readRealsTagExpectingSize(ifd, "CalibrationIlluminant2", 1)[0];
		const illuminant2 = STANDARD_ILLUMINANTS[illuminantID2];
		if (!illuminant1 || !illuminant2) {
			throw new Error("unrecognized standard illuminants");
		}
		const linear1 = matrixMultiply(
			matrixInverse(colorMatrix1),
			[[illuminant1.tri.x], [illuminant1.tri.y], [illuminant1.tri.z]],
		);
		const linear2 = matrixMultiply(
			matrixInverse(colorMatrix2),
			[[illuminant2.tri.x], [illuminant2.tri.y], [illuminant2.tri.z]],
		);
		console.log(illuminant1, "=>", linear1);
		console.log(illuminant2, "=>", linear2);
	}

	toAsShotRGB(cameraRGB: CameraRGB): CameraRGB {
		const red = cameraRGB.red / this.asShotNeutral[0];
		const green = cameraRGB.green / this.asShotNeutral[1];
		const blue = cameraRGB.blue / this.asShotNeutral[2];
		return {
			space: "CameraRGB",
			red,
			green,
			blue,
		};
	}

	toXYZ_D50(rgb: CameraRGB): XYZ {
		const product = matrixMultiply(this.cameraToXYZ_D50, [[rgb.red], [rgb.green], [rgb.blue]]);
		return {
			space: "XYZ",
			x: product[0][0],
			y: product[1][0],
			z: product[2][0],
		};
	}
}
