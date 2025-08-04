import { CameraRGBRect } from "./color.js";
import type { ActiveAreaPattern } from "./dng.js";

export const CFA_COLORS = {
	red: new Set([0, 4, 5, 6]),
	green: new Set([1, 3, 5, 6]),
	blue: new Set([2, 3, 4, 6]),
};

export interface Demosaic {
	demosaic(linearized: number[][], topLeft: { x0: number, y0: number }): CameraRGBRect;
}

export class NoDemosaic implements Demosaic {
	demosaic(linearized: number[][]): CameraRGBRect {
		const cameraRGB = CameraRGBRect.allocate({
			width: linearized[0].length,
			height: linearized.length,
		});
		for (let y = 0; y < linearized.length; y++) {
			for (let x = 0; x < linearized[y].length; x++) {
				const i = 3 * (y * linearized[0].length + x);
				cameraRGB.data[i + 0] = linearized[y][x];
				cameraRGB.data[i + 1] = linearized[y][x];
				cameraRGB.data[i + 2] = linearized[y][x];
			}
		}
		return cameraRGB;
	}
}

export class Pixelate implements Demosaic {
	constructor(
		private readonly pattern: ActiveAreaPattern,
		private punch: boolean,
	) {
	}

	demosaic(linearized: number[][], topLeft: { x0: number; y0: number; }): CameraRGBRect {
		const patternHeight = this.pattern.patternHeight;
		const patternWidth = this.pattern.patternWidth;
		if (linearized.length % patternHeight !== 0 || linearized[0].length % patternWidth !== 0) {
			throw new Error("linearized dimensions must be a multiple of the CFAPattern size");
		} else if ((topLeft.y0 - this.pattern.activeArea.activeAreaTop) % patternHeight !== 0) {
			throw new Error("linearized must be aligned with CFAPattern size");
		} else if ((topLeft.x0 - this.pattern.activeArea.activeAreaLeft) % patternWidth !== 0) {
			throw new Error("linearized must be aligned with CFAPattern size");
		}

		console.log("this.pattern:", this.pattern);

		const height = linearized.length;
		const width = linearized[0].length;
		const out = CameraRGBRect.allocate({ width, height });

		for (let r = 0; r < height; r += patternHeight) {
			for (let c = 0; c < width; c += patternWidth) {
				let greenSum = 0;
				let greenCount = 0;
				let redSum = 0;
				let redCount = 0;
				let blueSum = 0;
				let blueCount = 0;

				for (let u = 0; u < patternHeight; u++) {
					for (let v = 0; v < patternWidth; v++) {
						const color = this.pattern.pattern[u][v];
						const value = linearized[r + u][c + v];
						if (color === 0) {
							redCount += 1;
							redSum += value;
						} else if (color === 1) {
							greenCount += 1;
							greenSum += value;
						} else if (color === 2) {
							blueCount += 1;
							blueSum += value;
						}
						// TODO: support non RGB color filter arrays...
					}
				}

				for (let u = 0; u < patternHeight; u++) {
					for (let v = 0; v < patternWidth; v++) {
						const i = 3 * ((r + u) * width + c + v);
						out.data[i + 0] = redSum / redCount;
						out.data[i + 1] = greenSum / greenCount;
						out.data[i + 2] = blueSum / blueCount;

						if (this.punch) {
							const color = this.pattern.pattern[u][v];
							const value = linearized[r + u][c + v];
							if (color === 0) {
								out.data[i + 0] = value;
							} else if (color === 1) {
								out.data[i + 1] = value;
							} else if (color === 2) {
								out.data[i + 2] = value;
							}
						}
					}
				}
			}
		}

		return out;
	}
}

export class RGGBMosaic implements Demosaic {
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

				const cRight = c + 2 < width ? c + 2 : c;
				const cLeft = c > 0 ? c - 1 : c + 1;
				const rUp = r > 0 ? r - 1 : r + 1;
				const rDown = r + 2 < height ? r + 2 : r;

				const greenLeft = array[r][cLeft];
				const greenUp = array[rUp][c];
				const greenRight = array[r + 1][cRight];
				const greenDown = array[rDown][c + 1];
				const redRight = array[r][cRight];
				const redDown = array[rDown][c];
				const redDownRight = array[rDown][cRight];
				const blueUp = array[rUp][c + 1];
				const blueLeft = array[r + 1][cLeft];
				const blueUpLeft = array[rUp][cLeft];

				const i_00 = (width * r + c) * 3;
				// const i_m1 = i_00 - 3 * width;
				const i_10 = i_00 + 3 * width;
				const i_11 = i_10 + 3;

				// [0, 0] RGB (red)
				out.data[i_00 + 0] = red00;
				out.data[i_00 + 1] = (greenLeft + greenUp + green01 + green10) / 4;
				out.data[i_00 + 2] = (blue11 + blueLeft + blueUpLeft + blueUp) / 4;

				// [0, 1] RGB (green)
				out.data[i_00 + 3] = (red00 + redRight) / 2;
				out.data[i_00 + 4] = green01;
				out.data[i_00 + 5] = (blue11 + blueUp) / 2;

				// [1, 0] RGB (green)
				out.data[i_10 + 0] = (red00 + redDown) / 2;
				out.data[i_10 + 1] = green10;
				out.data[i_10 + 2] = (blue11 + blueLeft) / 2;

				// [1, 1] RGB (blue)
				out.data[i_11 + 0] = (red00 + redRight + redDown + redDownRight) / 4;
				out.data[i_11 + 1] = (greenRight + greenDown + green01 + green10) / 4;
				out.data[i_11 + 2] = blue11;
			}
		}

		return out;
	}
}
