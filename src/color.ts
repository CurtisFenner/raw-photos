export type XYZ = {
	space: "XYZ",
	X: number,
	Y: number,
	Z: number,
};

export type Oklab = {
	space: "oklab",
	L: number,
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
		X: 0.398 * Math.exp(-1250 * Math.log((wavelengthNm + 570.01) / 1014) ** 2)
			+ 1.132 * Math.exp(-234 * Math.log((1338 - wavelengthNm) / 743.5) ** 2),
		Y: 1.011 * Math.exp(-0.5 * ((wavelengthNm - 556.1) / 46.14) ** 2),
		Z: 2.060 * Math.exp(-32 * Math.log((wavelengthNm - 265.8) / 180.4) ** 2),
	};
}

/**
 * https://bottosson.github.io/posts/oklab/
 *
 * Oklab uses the D65 whitepoint (also used by sRGB).
 */
export function convertXYZ(xyz: XYZ) {
	const lms: LMS = {
		space: "lms",
		l:
			xyz.X * 0.8189330101
			+ xyz.Y * 0.3618667424
			+ xyz.Z * -0.1288597137,
		m:
			xyz.X * 0.0329845436
			+ xyz.Y * 0.9293118715
			+ xyz.Z * 0.0361456387,
		s:
			xyz.X * 0.0482003018
			+ xyz.Y * 0.2643662691
			+ xyz.Z * 0.6338517070,
	};

	const lms2 = {
		l: Math.pow(lms.l, 1 / 3),
		m: Math.pow(lms.m, 1 / 3),
		s: Math.pow(lms.s, 1 / 3),
	};

	const oklab: Oklab = {
		space: "oklab",
		L:
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
		X: luminance * x / y,
		Y: luminance,
		Z: luminance * z / y,
	};
}

/**
 * https://exiftool.org/TagNames/EXIF.html#LightSource
 * 0: Unknown
 * 1: Daylight
 * 2: Fluorescent
 * 3: Tungsten (Incandescent)
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
 * 24: ISO Studio Tungsten
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
			X: 109.85,
			Y: 100,
			Z: 35.58,
		},
	},
	/** D65. */
	21: {
		temperatureK: 6504,
		tri: {
			space: "XYZ",
			X: 95.047,
			Y: 100,
			Z: 108.883,
		},
	},
	/** D50 */
	23: {
		temperatureK: 5003,
		tri: {
			// https://www.mathworks.com/help/images/ref/whitepoint.html
			space: "XYZ",
			X: 96.42,
			Y: 100,
			Z: 82.51,
		},
	},
};

/**
 * Converts from CIE xyY to XYZ.
 *
 * This is a simple relabeling and is independent of the particular curves
 * (1931 vs 1964, 2-deg vs 10-deg, etc)
 */
export function fromChromaticity(p: {
	x: number,
	y: number,
	Y?: number,
}): Readonly<{
	/** x chromaticity, defined as x = X / (X+Y+Z). */
	x: number,
	/** y chromaticity, defined as y = Y / (X+Y+Z). */
	y: number,
	X: number,
	Y: number,
	Z: number,
}> {
	const Y = p.Y ?? 1;
	return Object.freeze({
		x: p.x,
		y: p.y,
		X: p.x * Y / p.y,
		Y,
		Z: (1 - p.x - p.y) * Y / p.y,
	});
}

/**
 * The Rec-709 chromaticities for red, green, and blue phosphors in displays.
 * This standard is incorporated into the sRGB specification.
 *
 * Given in CIE 1931 2-degree xyY.
 *
 * The `white`-point corresponds to (roughly) D65.
 *
 * The `red`, `green`, and `blue` primaries are scaled (by their `Y` components)
 * so that they add to form the `white` (+-0.0095%)
 *
 * @see https://www.itu.int/rec/R-REC-BT.709-5-200204-S/en
 */
export const rec709Primaries = Object.freeze({
	/**
	 * The chromaticity of grays:
	 * when the red, green, and blue channels have equal values.
	 */
	white: fromChromaticity({
		x: 0.3127,
		y: 0.3290,
		Y: 1,
	}),
	red: fromChromaticity({
		x: 0.640,
		y: 0.330,
		Y: 0.2126,
	}),
	green: fromChromaticity({
		x: 0.300,
		y: 0.600,
		Y: 0.7152,
	}),
	blue: fromChromaticity({
		x: 0.150,
		y: 0.060,
		Y: 0.0722,
	}),
});

/**
 * Approximate gamma mapping of sRGB, using the v^2.2 approximation.
 */
export function srgbLinearToMapped(v: number): number {
	return Math.pow(Math.max(0, v), 1 / 2.2);
}

/**
 * Approximate inverse gamma mapping of sRGB, using the v^2.2 approximation.
 */
export function srgbLinearToMappedInverse(v: number): number {
	return Math.pow(Math.max(0, v), 2.2);
}

/**
 * A 3x3 row-major matrix. `M*[R;G;B]` will compute `[X;Y;Z]`.
 */
export const linear_sRGB_to_XYZ = Object.freeze([
	rec709Primaries.red.X,
	rec709Primaries.green.X,
	rec709Primaries.blue.X,
	rec709Primaries.red.Y,
	rec709Primaries.green.Y,
	rec709Primaries.blue.Y,
	rec709Primaries.red.Z,
	rec709Primaries.green.Z,
	rec709Primaries.blue.Z,
]);

// Manually inverted:
export const xyz_to_linear_sRGB = Object.freeze([
	+3.24156, -1.53767, -0.49870,
	-0.96920, +1.87589, +0.04155,
	+0.05562, -0.20396, +1.05686,
]);

// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
export const xyz_D50_to_linear_sRGB = Object.freeze([
	3.1338561, -1.6168667, -0.4906146,
	-0.9787684, 1.9161415, 0.0334540,
	0.0719453, -0.2289914, 1.4052427,
]);

/**
 * @param a a `?`x`d` matrix
 * @param b a `d`x`?` matrix
 */
export function mat3Multiply(a: readonly number[], d: number, b: readonly number[]): number[] {
	const m = [];
	const mr = a.length / d;
	const mc = b.length / d;
	for (let r = 0; r < mr; r++) {
		for (let c = 0; c < mc; c++) {
			let s = 0;
			for (let k = 0; k < d; k++) {
				s += a[r * d + k] * b[mc * k + c];
			}
			m.push(s);
		}
	}
	return m;
}
