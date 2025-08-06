import * as culori from "culori";
import { matrixInverse, matrixMultiply, diagonalMatrix as matrixWithDiagonal } from "./data.js";
import * as dng from "./dng.js";
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

/**
 * Represents a sequence of `CameraRGB` values, in RGB order.
 */
export type CameraRGBSlice = Float32Array & { __brand: "CameraRGBSlice" };

export class CameraRGBRect {
	constructor(
		public readonly data: CameraRGBSlice,
		public readonly width: number,
		public readonly height: number,
	) { }

	sliceOfRow(p: { row: number, left: number, width: number }): CameraRGBSlice {
		const start = p.row * this.width + p.left;
		const end = start + p.width;
		return this.data.slice(3 * start, 3 * end) as CameraRGBSlice;
	}

	static allocate(size: { width: number, height: number }) {
		const data = new Float32Array(3 * size.width * size.height);
		return new CameraRGBRect(data as CameraRGBSlice, size.width, size.height);
	}

	getPixel(r: number, c: number): CameraRGB {
		const i = (r * this.width + c) * 3;
		return {
			space: "CameraRGB",
			red: this.data[i + 0],
			green: this.data[i + 1],
			blue: this.data[i + 2],
		};
	}

	toImageData(): ImageData {
		const imageData = new ImageData(this.width, this.height, {
			colorSpace: "srgb",
		});
		let o = 0;
		let i = 0;
		for (let r = 0; r < this.height; r++) {
			for (let c = 0; c < this.width; c++) {
				// TODO: Dither to increase color precision
				imageData.data[o + 0] = 255 * this.data[i + 0];
				imageData.data[o + 1] = 255 * this.data[i + 1];
				imageData.data[o + 2] = 255 * this.data[i + 2];
				imageData.data[o + 3] = 255;
				o += 4;
				i += 3;
			}
		}

		return imageData;
	}
}

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
export const STANDARD_ILLUMINANTS: Record<number, {
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
	/** D50 */
	23: {
		temperatureK: 5003,
		tri: {
			// https://www.mathworks.com/help/images/ref/whitepoint.html
			space: "XYZ",
			x: 96.42,
			y: 100,
			z: 82.51,
		},
	},
};
