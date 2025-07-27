import { CameraRGB } from "./color.js";
import { mod } from "./data.js";
import type { ActiveAreaPattern } from "./dng.js";

export const CFA_COLORS = {
	red: new Set([0, 4, 5, 6]),
	green: new Set([1, 3, 5, 6]),
	blue: new Set([2, 3, 4, 6]),
};

/**
 * Represents a sequence of `CameraRGB` values, in RGB order.
 */
export type CameraRGBSlice = Float32Array & { __brand: "CameraRGBSlice" };

class CameraRGBRect {
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
}

export class RGGBMosaic {
	constructor(
		private readonly pattern: ActiveAreaPattern,
	) {
		if (pattern.patternWidth !== 2 || pattern.patternHeight !== 2) {
			throw new Error("RGGBMosaic requires the RGGB CFAPattern");
		}
	}

	demosaic(array: number[][], topLeft: { x0: number, y0: number }): CameraRGBRect {
		const patternHeight = this.pattern.patternHeight;
		const patternWidth = this.pattern.patternWidth;
		if (array.length % patternHeight !== 0 || array[0].length % patternWidth !== 0) {
			throw new Error("array dimensions must be a multiple of the CFAPattern size");
		} else if ((topLeft.y0 - this.pattern.activeArea.activeAreaTop) % patternHeight !== 0) {
			throw new Error("array must be aligned with CFAPattern size");
		} else if ((topLeft.x0 - this.pattern.activeArea.activeAreaLeft) % patternWidth !== 0) {
			throw new Error("array must be aligned with CFAPattern size");
		}

		const out = CameraRGBRect.allocate({ width: array[0].length, height: array.length });
		const height = array.length;
		const width = array[0].length;

		for (let r = 0; r < height; r += 2) {
			for (let c = 0; c < width; c += 2) {
				const red00 = array[r][c];
				const green01 = array[r][c + 1];
				const green10 = array[r + 1][c];
				const blue11 = array[r + 1][c + 1];

				const i_0 = (width * r + c) * 3;
				// const i_m1 = i_0 - 3 * width;
				const i_1 = i_0 + 3 * width;

				// [0, 0] RGB
				out.data[i_0 + 0] = red00;
				out.data[i_0 + 1] = (green01 + green10) / 2;
				out.data[i_0 + 2] = blue11;

				// [0, 1] RGB
				out.data[i_0 + 3] = red00;
				out.data[i_0 + 4] = green01;
				out.data[i_0 + 5] = blue11;

				// [1, 0] RGB
				out.data[i_1 + 0] = red00;
				out.data[i_1 + 1] = green10;
				out.data[i_1 + 2] = blue11;

				// [1, 1] RGB
				out.data[i_1 + 3] = red00;
				out.data[i_1 + 4] = (green01 + green10) / 2;
				out.data[i_1 + 5] = blue11;
			}
		}

		return out;
	}
}
