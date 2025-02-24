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

const ILLUMINANT_COLOR_TEMPERATURE_K: Record<number, number> = {
	/**
	 * Illuminant A. Standard tungsten incandescant bulb.
	 */
	17: 2856,
	/** D65. */
	21: 6500,
};

export class WhiteBalance {
	private colorMatrix1: number[][];
	private forwardMatrix1: number[][];
	private cameraCalibration1: number[][];
	private analogBalance: number[];

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
	private calibrationIlluminant1: number;
	private calibrationIlluminant1xyz: XYZ;

	/** AnalogBalance * CameraCalibration */
	private rgbGain: number[][];
	private rgbGainInverse: number[][];
	/** CameraNeutral = (rgbGain * ColorMatrix) * XYZNeutral */
	private cameraNeutral: CameraRGB;

	/** toXYZ_D50 = ForwardMatrix * ReferenceNeutral^-1 * (rgbGain)^-1 */
	private toXYZ_d50: number[][];

	/** The neutral white balance in the linear space. */
	private asShotNeutral: number[];

	constructor(ifd: ImageFileDirectory) {
		this.asShotNeutral = readRealsTagExpectingSize(ifd, "AsShotNeutral", 3);

		this.colorMatrix1 = readRealRectangles<2>(ifd, "ColorMatrix1", [3, 3]);
		this.forwardMatrix1 = readRealRectangles<2>(ifd, "ForwardMatrix1", [3, 3]);
		this.cameraCalibration1 = readRealRectangles<2>(ifd, "CameraCalibration1", [3, 3]);
		this.analogBalance = readRealsTagExpectingSize(ifd, "AnalogBalance", 3, { default: 1 });
		this.calibrationIlluminant1 = readRealsTagExpectingSize(ifd, "CalibrationIlluminant1", 1)[0];

		this.calibrationIlluminant1xyz = daylightXYZ(ILLUMINANT_COLOR_TEMPERATURE_K[this.calibrationIlluminant1], 1);

		this.rgbGain = matrixMultiply(matrixWithDiagonal(this.analogBalance), this.cameraCalibration1);
		this.rgbGainInverse = matrixInverse(this.rgbGain);

		const cameraNeutral = matrixMultiply(matrixMultiply(this.rgbGain, this.colorMatrix1), [
			[this.calibrationIlluminant1xyz.x], [this.calibrationIlluminant1xyz.y], [this.calibrationIlluminant1xyz.z],
		]);
		this.cameraNeutral = {
			space: "CameraRGB",
			red: cameraNeutral[0][0],
			green: cameraNeutral[1][0],
			blue: cameraNeutral[2][0],
		};

		/** ReferenceNeutral = (rgbGain)^-1 * cameraNeutral */
		const referenceNeutral = matrixMultiply(this.rgbGainInverse, cameraNeutral);

		this.toXYZ_d50 = matrixMultiply(
			matrixMultiply(
				this.forwardMatrix1,
				matrixWithDiagonal(matrixToArray(referenceNeutral)),
			),
			this.rgbGainInverse,
		);
	}

	toRGB(cameraRGB: CameraRGB): CameraRGB {
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

	toXYZ(cameraRGB: CameraRGB): XYZ {
		// ReferenceNeutral = (rgbGain)^-1 * CameraNeutral
		// toXYZ_D50 = ForwardMatrix * ReferenceNeutral^-1 * (rgbGain)^-1
		const rgb = [[cameraRGB.red / this.asShotNeutral[0]], [cameraRGB.green / this.asShotNeutral[1]], [cameraRGB.blue / this.asShotNeutral[2]]];
		const product = matrixMultiply(this.toXYZ_d50, rgb);
		return {
			space: "XYZ",
			x: product[0][0],
			y: product[1][0],
			z: product[2][0],
		};
	}
}
