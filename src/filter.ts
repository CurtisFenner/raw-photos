import { CameraRGBRect, daylightXYZ, STANDARD_ILLUMINANTS } from "./color.js";
import { diagonalMatrix, matrixInverse, matrixMultiply } from "./data.js";
import { ALL_TAG_VALUES, readRealRectangles, readRealsTagExpectingSize } from "./dng.js";
import { ImageFileDirectory } from "./tiff-ep.js";
import * as culori from "culori";

export interface Filter {
	apply(input: CameraRGBRect, topLeft: { x0: number, y0: number }): CameraRGBRect;
}

type RGB = { r: number, g: number, b: number };

export abstract class ColorFilter implements Filter {
	abstract transform(r: number, g: number, b: number): RGB;

	apply(input: CameraRGBRect): CameraRGBRect {
		const output = CameraRGBRect.allocate(input);
		for (let y = 0; y < input.height; y++) {
			for (let x = 0; x < input.width; x++) {
				const i = 3 * (y * input.width + x);
				const rgb = this.transform(
					input.data[i + 0],
					input.data[i + 1],
					input.data[i + 2],
				);
				output.data[i + 0] = rgb.r;
				output.data[i + 1] = rgb.g;
				output.data[i + 2] = rgb.b;
			}
		}
		return output;
	}
}

export class MatrixFilter extends ColorFilter {
	constructor(private matrix: number[][]) { super(); }

	override transform(r: number, g: number, b: number): RGB {
		const rgb = matrixMultiply(this.matrix, [
			[r],
			[g],
			[b],
		]);
		return { r: rgb[0][0], g: rgb[1][0], b: rgb[2][0] };
	}
}

export class ScaleFilter extends ColorFilter {
	constructor(private scale: RGB) {
		super();
	}

	transform(r: number, g: number, b: number): RGB {
		return {
			r: r * this.scale.r,
			g: g * this.scale.g,
			b: b * this.scale.b,
		};
	}
}

export class AsShotNeutralWhiteBalanceFilter extends ScaleFilter {
	constructor(ifd: ImageFileDirectory) {
		const [r, g, b] = readRealsTagExpectingSize(ifd, "AsShotNeutral", 3);
		super({ r: 1 / r, g: 1 / g, b: 1 / b });
	}
}

/**
 * Output: XYZ D50 (NOT RGB!)
 */
export class TemperatureWhiteBalanceFilter extends MatrixFilter {
	constructor(rawIFD: ImageFileDirectory, settings: {
		useCC: boolean,
		tempK: number,
	}) {
		const calibrationIlluminant1 = readRealsTagExpectingSize(rawIFD, "CalibrationIlluminant1", 1)[0];
		const calibrationData1 = STANDARD_ILLUMINANTS[calibrationIlluminant1];
		if (!calibrationData1) {
			throw new Error(`unsupported calibration illuminant ${calibrationIlluminant1}`);
		}
		const calibrationIlluminant2 = readRealsTagExpectingSize(rawIFD, "CalibrationIlluminant2", 1)[0];
		const calibrationData2 = STANDARD_ILLUMINANTS[calibrationIlluminant2];
		if (!calibrationData2) {
			throw new Error(`unsupported calibration illuminant ${calibrationIlluminant2}`);
		}

		const matrixWeightAlpha = ((1 / settings.tempK) - (1 / calibrationData2.temperatureK)) / ((1 / calibrationData1.temperatureK) - (1 / calibrationData2.temperatureK));
		function weighted3x3(name: keyof typeof ALL_TAG_VALUES & `${string}1`): number[][] {
			const m1 = readRealRectangles<2>(rawIFD, name, [3, 3]);
			const m2 = readRealRectangles<2>(rawIFD, name.replace(/1$/, "2") as keyof typeof ALL_TAG_VALUES, [3, 3]);
			const out: number[][] = [];
			for (let r = 0; r < 3; r++) {
				out[r] = [];
				for (let c = 0; c < 3; c++) {
					out[r][c] = matrixWeightAlpha * m1[r][c] + (1 - matrixWeightAlpha) * m2[r][c];
				}
			}
			return out;
		}

		const colorMatrix = weighted3x3("ColorMatrix1");

		const cameraCalibration = settings.useCC
			? weighted3x3("CameraCalibration1")
			: diagonalMatrix([1, 1, 1]);

		const analogBalance = readRealsTagExpectingSize(
			rawIFD, "AnalogBalance",
			3,
			{ default: 1 },
		);

		const xyzNeutral = daylightXYZ(settings.tempK, 1);

		const xyzToCamera = matrixMultiply(
			diagonalMatrix(analogBalance),
			matrixMultiply(
				cameraCalibration,
				colorMatrix,
			),
		);

		const cameraNeutral = matrixMultiply(
			xyzToCamera,
			[
				[xyzNeutral.x],
				[xyzNeutral.y],
				[xyzNeutral.z],
			],
		);

		// "ReferenceNeutral = Inverse (AB * CC) * CameraNeutral"
		const referenceNeutral = matrixMultiply(
			matrixInverse(
				matrixMultiply(
					diagonalMatrix(analogBalance),
					cameraCalibration,
				),
			),
			cameraNeutral,
		);

		// "D = Invert (AsDiagonalMatrix (ReferenceNeutral))"
		const cameraWhiteBalancing = matrixInverse(
			diagonalMatrix(
				[
					referenceNeutral[0][0],
					referenceNeutral[1][0],
					referenceNeutral[2][0],
				],
			),
		);


		let forwardMatrix: number[][] | null;
		try {
			forwardMatrix = weighted3x3("ForwardMatrix1");
		} catch (err) {
			forwardMatrix = null;
		}

		let cameraToXYZ_D50: number[][];
		if (forwardMatrix === null) {
			// "If the ForwardMatrix tags are not included in the camera profile"
			// CameraToXYZ = Inverse (XYZtoCamera)
			// CameraToXYZ_D50 = CA * CameraToXYZ
			// > CA, above, is a chromatic adaptation matrix that maps from the
			// > white balance xy value to the D50 white point.
			// > The recommended method for computing this chromatic adaptation
			// > matrix is to use the linear Bradford algorithm

			// TODO: Implement chromatic adaptation
			const chromaticAdaptation = diagonalMatrix([1, 1, 1]);
			cameraToXYZ_D50 = matrixMultiply(
				chromaticAdaptation,
				matrixInverse(xyzToCamera),
			);
		} else {
			// From pg 103 of the DNG 1.7.1.0 spec:
			// "If the ForwardMatrix tags are included in the camera profile"
			// "CameraToXYZ_D50 = FM * D * Inverse (AB * CC)"
			cameraToXYZ_D50 = matrixMultiply(
				matrixMultiply(
					forwardMatrix,
					cameraWhiteBalancing,
				),
				matrixInverse(
					matrixMultiply(
						diagonalMatrix(analogBalance),
						cameraCalibration,
					),
				),
			);
		}

		super(cameraToXYZ_D50);
	}
}

export class TransformXYZ_D50ToSRGB extends ColorFilter {
	override transform(r: number, g: number, b: number): RGB {
		return culori.convertXyz50ToRgb({ x: r, y: g, z: b });
	}
}
