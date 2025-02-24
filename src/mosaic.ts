import { CameraRGB } from "./color.js";
import { mod } from "./data.js";
import type { ActiveAreaPattern } from "./dng.js";

export const CFA_COLORS = {
	red: new Set([0, 4, 5, 6]),
	green: new Set([1, 3, 5, 6]),
	blue: new Set([2, 3, 4, 6]),
};

export class RGGBMosaic {
	constructor(
		private readonly pattern: ActiveAreaPattern,
	) {
		if (pattern.patternWidth !== 2 || pattern.patternHeight !== 2) {
			throw new Error("RGGBMosaic requires the RGGB CFAPattern");
		}
	}

	demosaicPattern(pr: number, pc: number, get: (dr: number, dc: number) => number): CameraRGB {
		if (pr === 0 && pc === 0) {
			// Red
			const red = get(0, 0);
			const green = (get(-1, 0) + get(1, 0) + get(0, -1) + get(0, 1)) / 4;
			const blue = (get(-1, -1) + get(-1, 1) + get(1, -1) + get(1, 1)) / 4;
			return {
				space: "CameraRGB",
				red,
				green,
				blue,
			};
		} else if (pr === 1 && pc === 1) {
			// Blue
			const blue = get(0, 0);
			const green = (get(-1, 0) + get(1, 0) + get(0, -1) + get(0, 1)) / 4;
			const red = (get(-1, -1) + get(-1, 1) + get(1, -1) + get(1, 1)) / 4;
			return {
				space: "CameraRGB",
				red,
				green,
				blue,
			};
		} else {
			// Green
			const green = get(0, 0);
			const blue = (get(pc, pr) + get(-pc, -pr)) / 2;
			const red = (get(pr, pc) + get(-pr, -pc)) / 2;
			return {
				space: "CameraRGB",
				red,
				green,
				blue,
			};
		}
	}

	demosaic(array: number[][], topLeft: { x0: number, y0: number }): CameraRGB[][] {
		const patternHeight = this.pattern.patternHeight;
		const patternWidth = this.pattern.patternWidth;
		if (array.length % patternHeight !== 0 || array[0].length % patternWidth !== 0) {
			throw new Error("array dimensions must be a multiple of the CFAPattern size");
		} else if ((topLeft.y0 - this.pattern.activeArea.activeAreaTop) % patternHeight !== 0) {
			throw new Error("array must be aligned with CFAPattern size");
		} else if ((topLeft.x0 - this.pattern.activeArea.activeAreaLeft) % patternWidth !== 0) {
			throw new Error("array must be aligned with CFAPattern size");
		}

		const out: CameraRGB[][] = [];
		for (let pr = 0; pr < patternHeight; pr++) {
			for (let pc = 0; pc < patternWidth; pc++) {
				for (let br = 0; br * patternHeight < array.length; br++) {
					for (let bc = 0; bc * patternWidth < array[0].length; bc++) {
						const ar = br * patternHeight + pr;
						out[ar] = out[ar] || [];
						const ac = bc * patternWidth + pc;
						out[ar][ac] = this.demosaicPattern(
							pr,
							pc,
							(dr, dc) => {
								let tr = ar + dr;
								if (tr < 0) {
									tr = mod(tr, patternHeight);
								}
								while (tr >= array.length) {
									tr -= patternHeight;
								}

								let tc = ac + dc;
								if (tc < 0) {
									tc = mod(tc, patternWidth);
								}
								while (tc >= array[0].length) {
									tc -= patternWidth;
								}
								return array[tr][tc];
							},
						);
					}
				}
			}
		}

		return out;
	}
}
