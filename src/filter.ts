import { CameraRGBRect } from "./color";
import { matrixMultiply } from "./data";
import { readRealsTagExpectingSize } from "./dng";
import { ImageFileDirectory } from "./tiff-ep";

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
