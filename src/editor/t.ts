import { CameraRGBRect } from "../color.js";
import * as data from "../data.js";
import * as dngLinearReference from "../dng-linear-reference.js";
import * as dng from "../dng.js";
import { Demosaic, NoDemosaic, RGGBMosaic } from "../mosaic.js";
import * as tiffEp from "../tiff-ep.js";
import * as tiff6 from "../tiff6.js";

export const latestRefresh = { token: null as unknown };

export type TIFF = {
	byteOrder: "big-endian" | "little-endian";
	ifds: tiffEp.ImageFileDirectory[];
	problems: string[];
	scanner: data.Scanner;
};

export class Pauser {
	private lastPause = performance.now();

	constructor(
		private maxPauseMs: number
	) { }

	async pause() {
		const elapsed = performance.now() - this.lastPause;
		if (elapsed < this.maxPauseMs) {
			return false;
		}

		await new Promise(resolve => requestAnimationFrame(resolve));
		this.lastPause = performance.now();
		return true;
	}
}

export const editorDiv = document.getElementById("editor-div") as HTMLDivElement;
export const tabTagsDiv = document.getElementById("tab-tags-div") as HTMLDivElement;
export const tabImageDiv = document.getElementById("tab-image-div") as HTMLDivElement;

export const imagePreviewDiv = document.getElementById("image-preview-div") as HTMLDivElement;

export function isIFDRaw(ifd: tiffEp.ImageFileDirectory): boolean {
	const f = tiffEp.readTag(
		ifd,
		tiff6.TIFF6_TAG_VALUES.NewSubfileType,
		tiffEp.readInts,
	);
	return f !== undefined && f[0] === 0;
}
