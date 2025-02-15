import * as jpeg from "./jpeg.js";
import * as tiffEp from "./tiff-ep.js";
import * as tiff6 from "./tiff6.js";

const ms0 = performance.now();
const dngResponse = await fetch("vending.dng");
const msResponse = performance.now();
const dng = new Uint8Array(await dngResponse.arrayBuffer());
const msBytes = performance.now();

const tiff = tiffEp.parseTIFF_EP(dng);

const msTIFF = performance.now();

const rawIFD = tiff.ifds.findLast(x => {
	const f = tiffEp.readTag(x, tiff6.TIFF6_TAG_VALUES.NewSubfileType, tiff.scanner, tiffEp.readInts);
	return f && f[0] === 0;
})!;

const msRawIFD = performance.now();

const div = document.createElement("div");
div.style.position = "relative";
div.style.width = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiff.scanner, tiffEp.readInts)![0] + "px";
div.style.height = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiff.scanner, tiffEp.readInts)![0] + "px";

document.body.appendChild(div);
div.style.background = "lime";

for (const segment of tiffEp.readImageSegments(tiff.scanner, rawIFD)) {
	const slice = tiff.scanner.getSlice(segment);
	const jpegData = jpeg.decodeJPEG(slice);

	const dataByComponent = jpegData.differences
		.map(x => jpeg.applyLosslessPredictor(jpegData.sosHeader, x));

	const jpegComponentsSequential = [];
	for (let y = 0; y < jpegData.sof3Header.lines; y++) {
		for (let x = 0; x < jpegData.sof3Header.samplesPerLine; x++) {
			for (let k = 0; k < jpegData.differences.length; k++) {
				const n = dataByComponent[k][y][x];
				jpegComponentsSequential.push(n);
			}
		}
	}

	const segmentWidth = segment.x1 - segment.x0;
	const segmentArea = segmentWidth * (segment.y1 - segment.y0);
	if (segmentArea !== jpegComponentsSequential.length) {
		// (assuming segment components == 1)
		console.error("unexpected sequential size mismatch:", { segmentArea }, "vs", jpegComponentsSequential.length);
		continue;
	}

	const canvas = document.createElement("canvas");
	canvas.width = segment.x1 - segment.x0;
	canvas.height = segment.y1 - segment.y0;
	canvas.style.position = "absolute";
	canvas.style.left = segment.x0 + "px";
	canvas.style.top = segment.y0 + "px";
	canvas.style.background = "#" + Math.random().toString(16).substring(2, 8);
	const ctx = canvas.getContext("2d")!;

	// Draw difference data.
	for (let i = 0; i < segmentArea; i++) {
		const y = Math.floor(i / segmentWidth);
		const x = i % segmentWidth;
		const data = jpegComponentsSequential[i];
		const p = Math.max(0, Math.min(1, data / (2 ** 16)));
		const s = (Math.pow(p * 4, 0.5) * 100).toFixed(0) + "%";
		const color = `rgb(${s}  ${s}  ${s})`;

		ctx.fillStyle = color;
		ctx.fillRect(x, y, 1, 1);
	}

	div.appendChild(canvas);

	await new Promise(resolve => requestAnimationFrame(resolve));
}

const msJPEGs = performance.now();

console.log({ rawIFD });

console.log({
	ms0,
	msResponse,
	msBytes,
	msTIFF,
	msRawIFD,
	msJPEGs,
});
