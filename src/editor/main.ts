import { CameraRGBRect } from "../color.js";
import * as data from "../data.js";
import * as dngLinearReference from "../dng-linear-reference.js";
import * as dng from "../dng.js";
import { RGGBMosaic } from "../mosaic.js";
import * as tiffEp from "../tiff-ep.js";
import * as tiff6 from "../tiff6.js";

const editorDiv = document.getElementById("editor-div") as HTMLDivElement;
const tabTagsDiv = document.getElementById("tab-tags-div") as HTMLDivElement;
const tabImageDiv = document.getElementById("tab-image-div") as HTMLDivElement;

const imagePreviewDiv = document.getElementById("image-preview-div") as HTMLDivElement;

let latestToken: unknown = null;
function markEditorLoading(
	token: unknown,
	loading: { fileName: string, sizeBytes: number },
) {
	if (token !== latestToken) {
		return;
	}
	editorDiv.classList.add("file-loading");
}

function isIFDRaw(ifd: tiffEp.ImageFileDirectory): boolean {
	const f = tiffEp.readTag(
		ifd,
		tiff6.TIFF6_TAG_VALUES.NewSubfileType,
		tiffEp.readInts,
	);
	return f !== undefined && f[0] === 0;
}

function reportError(token: unknown, err: unknown) {
	if (token !== latestToken) {
		return;
	}
	editorDiv.classList.remove("file-loading");
	editorDiv.classList.add("file-error");

	const radio = document.getElementById("active-tab-tags") as HTMLInputElement;
	radio.checked = true;

	tabImageDiv.innerHTML = "";
	tabTagsDiv.innerHTML = "";

	const details = document.createElement("details");
	const summary = document.createElement("summary");
	const summaryCode = document.createElement("code");
	summaryCode.textContent = String(err);
	summary.appendChild(summaryCode);
	details.appendChild(summary);
	const pre = document.createElement("pre");
	const samp = document.createElement("samp");
	samp.textContent = err instanceof Error ? String(err.stack) : typeof err;
	pre.appendChild(samp);
	details.appendChild(pre);

	tabTagsDiv.appendChild(details);
}

export type TIFF = {
	byteOrder: "big-endian" | "little-endian";
	ifds: tiffEp.ImageFileDirectory[];
	problems: string[];
	scanner: data.Scanner;
};

async function renderTags(token: unknown, tiff: TIFF) {
	if (token !== latestToken) {
		return;
	}

	editorDiv.classList.remove("file-loading");

	const radio = document.getElementById("active-tab-image") as HTMLInputElement;
	radio.checked = true;

	tabTagsDiv.innerHTML = "";

	if (tiff.problems.length !== 0) {
		const problemsUl = document.createElement("ul");
		for (const problem of tiff.problems) {
			const li = document.createElement("li");
			const samp = document.createElement("samp");
			samp.textContent = problem;
			li.appendChild(samp);
			problemsUl.appendChild(li);
		}

		problemsUl.classList.add("file-error", "show-error");
		tabTagsDiv.appendChild(problemsUl);
	}

	for (const ifd of tiff.ifds) {
		const details = document.createElement("details");
		const summary = document.createElement("summary");
		const index = tiff.ifds.indexOf(ifd);
		const summarySamp = document.createElement("samp");
		summarySamp.textContent = `ImageFileDirectory ${index} (at byte ${ifd.myOffset})`;
		summary.appendChild(summarySamp);
		details.setAttribute("open", "true");

		if (isIFDRaw(ifd)) {
			const bold = document.createElement("b");
			bold.textContent = " Contains raw data!";
			summary.appendChild(bold);
		}

		details.appendChild(summary);

		const ul = document.createElement("ul");
		details.appendChild(ul);

		tabTagsDiv.appendChild(details);

		if (ifd.entries.length === 0) {
			const li = document.createElement("li");
			const i = document.createElement("i");
			i.textContent = "(no entries)";
			li.appendChild(i);
			ul.appendChild(li);
			continue;
		}
		for (const entry of ifd.entries) {
			const info = tiffEp.FIELD_TYPES[entry.fieldType as keyof typeof tiffEp.FIELD_TYPES];
			const typeDescription = !info
				? `unknown type ${entry.fieldType}`
				: info.name;

			const dngTag = dng.DNG_TAGS[entry.tag as keyof typeof dng.DNG_TAGS]
				|| tiff6.TIFF6_TAGS[entry.tag as keyof typeof tiff6.TIFF6_TAGS];

			const tagName = dngTag
				? dngTag.name
				: entry.tag.toFixed(0);

			const li = document.createElement("li");
			const b = document.createElement("b");
			b.textContent = tagName;
			li.appendChild(b);

			const liSpan = document.createElement("span");
			liSpan.textContent = `: ${typeDescription} * ${entry.valueCount}`;
			li.appendChild(liSpan);
			ul.appendChild(li);

			const subUl = document.createElement("ul");
			li.appendChild(subUl);

			const ascii = tiffEp.readASCII(ifd.scanner, entry);
			if (ascii) {
				const asciiLi = document.createElement("li");
				const samp = document.createElement("samp");
				samp.textContent = JSON.stringify(ascii);
				asciiLi.appendChild(samp);
				subUl.appendChild(asciiLi);
			}

			const ints = tiffEp.readInts(ifd.scanner, entry);
			const reals = tiffEp.readReals(ifd.scanner, entry);
			const numbers = ints || reals;
			if (numbers) {
				const box = document.createElement("div");
				box.style.display = "inline-block";
				box.style.verticalAlign = "middle";

				const table = document.createElement("table");
				const tbody = document.createElement("tbody");
				table.appendChild(tbody);
				const tr = document.createElement("tr");
				tbody.appendChild(tr);
				numbers.slice(0, 17).map((v, i) => {
					const td = document.createElement("td");
					if (i < 16) {
						td.textContent = String(v);
					} else {
						td.textContent = "...";
					}
					tr.appendChild(td);
				});
				const tableLi = document.createElement("li");
				subUl.appendChild(tableLi);
				box.appendChild(table);
				tableLi.appendChild(box);
			}
		}
	}
}
class Pauser {
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

type PreviewSettings = {
	demosaic: "rggb-linear" | "grayscale",
};

function renderLinearizedSegmentCanvas(
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
	let cameraRGB: CameraRGBRect;
	if (previewSettings.demosaic === "rggb-linear") {
		const demosaicTransform = new RGGBMosaic(
			new dng.ActiveAreaPattern(linearizer.activeArea, [[0, 1], [1, 2]])
		);
		cameraRGB = demosaicTransform.demosaic(linearized, segment)
	} else {
		// TODO: Others
		// Gray scale
		cameraRGB = CameraRGBRect.allocate({
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
	}

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

async function renderImagePreview(token: unknown, tiff: TIFF) {
	if (token !== latestToken) {
		return;
	}

	imagePreviewDiv.innerHTML = "";
	const container = document.createElement("div");
	container.style.position = "relative";
	imagePreviewDiv.appendChild(container);


	const rawIFD = tiff.ifds.findLast(isIFDRaw)!;
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

		const pauser = new Pauser(55)
		for (const segment of tiffEp.readImageSegments(rawIFD)) {
			await pauser.pause();
			if (token !== latestToken || rerenderToken !== renderToken) {
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
			reportError(token, err);
		}
	};

	await changeOfSettingsWrapper();
	demosaicInput.onchange = changeOfSettingsWrapper;
}

async function loadFile(token: unknown, file: File) {
	latestToken = token;
	markEditorLoading(token, {
		fileName: file.name,
		sizeBytes: file.size,
	});

	try {
		const fileBytes = await file.arrayBuffer();

		const tiff = tiffEp.parseTIFF_EP(new Uint8Array(fileBytes));

		const rawIFD = tiff.ifds.findLast(isIFDRaw)!;
		if (!rawIFD) {
			throw new Error("No raw ImageFileDirectory found!");
		}

		await renderTags(token, tiff);
		await renderImagePreview(token, tiff);
	} catch (e) {
		reportError(token, e);
	}
}

export async function main() {
	const fileInput = document.getElementById("input-dng") as HTMLInputElement;
	fileInput.disabled = false;
	fileInput.addEventListener("change", () => {
		if (fileInput.files && fileInput.files[0]) {
			const file = fileInput.files[0];
			loadFile(Symbol(file.name), file);
		}
	});
}

main();
