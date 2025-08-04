import { CameraRGBRect } from "../color.js";
import * as dngLinearReference from "../dng-linear-reference.js";
import * as dng from "../dng.js";
import { Demosaic, NoDemosaic, RGGBMosaic } from "../mosaic.js";
import * as tiffEp from "../tiff-ep.js";
import * as tiff6 from "../tiff6.js";
import * as t from "./t.js";

type PreviewSettings = {
	demosaic: "rggb-linear" | "grayscale",
};

export function renderLinearizedSegmentCanvas(
	previewSettings: PreviewSettings,
	rawIFD: tiffEp.ImageFileDirectory,
	linearizer: dngLinearReference.Linearizer,
	segment: tiffEp.ImageSegment,
): HTMLCanvasElement {
	const linearizedPlanes = linearizer.linearizeImageSegment(rawIFD, segment);
	if (linearizedPlanes.length !== 1) {
		throw new Error(
			`Expected exactly 1 color plane (Color Filter Array image), but got ${linearizedPlanes.length}`
		);
	}
	const linearized = linearizedPlanes[0];

	// Demosaic:
	let demosaic: Demosaic;
	if (previewSettings.demosaic === "rggb-linear") {
		demosaic = new RGGBMosaic(
			new dng.ActiveAreaPattern(linearizer.activeArea, [[0, 1], [1, 2]])
		);
	} else {
		demosaic = new NoDemosaic();
	}
	let cameraRGB: CameraRGBRect = demosaic.demosaic(linearized, segment);

	// TODO: If white-balance...
	const canvas = document.createElement("canvas");
	canvas.width = segment.x1 - segment.x0;
	canvas.height = segment.y1 - segment.y0;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("your browser does nto support CanvasRenderingContext2D");
	}
	ctx.putImageData(cameraRGB.toImageData(), 0, 0);
	return canvas;
}

export async function renderImagePreview(
	token: unknown,
	tiff: t.TIFF,
	reportError: (err: unknown) => void,
) {
	if (token !== t.latestRefresh.token) {
		return;
	}

	t.imagePreviewDiv.innerHTML = "";
	const container = document.createElement("div");
	container.style.position = "relative";
	t.imagePreviewDiv.appendChild(container);

	const rawIFD = tiff.ifds.findLast(t.isIFDRaw)!;
	const linearizer = new dngLinearReference.Linearizer(rawIFD);

	const imageWidth = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiffEp.readInts)![0];
	const imageHeight = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiffEp.readInts)![0];
	container.style.width = `${imageWidth.toFixed(0)}px`;
	container.style.height = `${imageHeight.toFixed(0)}px`;

	let rerenderToken: unknown = null;

	const demosaicInput = document.getElementById("menu-demosaic-select") as HTMLSelectElement;

	const changeOfSettings = async () => {
		const renderToken = Symbol("rerender-" + String(token));
		rerenderToken = renderToken;

		const previewSettings: PreviewSettings = {
			demosaic: "grayscale",
		};
		if (demosaicInput.value === "rggb-linear") {
			previewSettings.demosaic = "rggb-linear";
		}

		const pauser = new t.Pauser(55)
		for (const segment of tiffEp.readImageSegments(rawIFD)) {
			await pauser.pause();
			if (token !== t.latestRefresh.token || rerenderToken !== renderToken) {
				return;
			}

			const segmentClass = `segment-x${segment.x0}-y${segment.y0}`;
			for (const existing of container.getElementsByClassName(segmentClass)) {
				container.removeChild(existing);
			}

			const canvas = renderLinearizedSegmentCanvas(previewSettings, rawIFD, linearizer, segment);
			container.getElementsByClassName(segmentClass)
			canvas.style.position = "absolute";
			canvas.style.top = segment.y0 + "px";
			canvas.style.imageRendering = "pixelated";
			canvas.style.left = segment.x0 + "px";
			canvas.classList.add(segmentClass);
			container.appendChild(canvas);
		}
	};

	const changeOfSettingsWrapper = async () => {
		try {
			for (const child of container.children) {
				child.classList.add("file-loading");
			}
			await changeOfSettings();
		} catch (err) {
			reportError(err);
		}
	};

	await changeOfSettingsWrapper();
	demosaicInput.onchange = changeOfSettingsWrapper;
}
