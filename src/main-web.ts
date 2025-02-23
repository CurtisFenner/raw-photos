import { Linearizer } from "./dng.js";
import * as tiffEp from "./tiff-ep.js";
import * as tiff6 from "./tiff6.js";
import * as color from "./color.js";

const showColorTemperatureTable = false;
if (showColorTemperatureTable) {
	const table = document.createElement("table");
	for (let temperature = 4_000; temperature < 15_000; temperature += 500) {
		const row = document.createElement("tr");

		const th = document.createElement("th");
		th.textContent = temperature.toFixed(0) + " K";
		row.appendChild(th);

		const xyz = color.daylightXYZ(temperature, 0.8);
		const { oklab } = color.convertXYZ(xyz);

		const td = document.createElement("td");
		td.textContent = color.colorTemperatureKelvin({ x: xyz.x / (xyz.x + xyz.y + xyz.z), y: xyz.y / (xyz.x + xyz.y + xyz.z) }).toFixed(0) + " K?";
		td.style.background = `oklab(${(oklab.l * 100).toFixed(1)}% ${oklab.a} ${oklab.b})`;
		row.appendChild(td);

		table.appendChild(row);
	}
	document.body.appendChild(table);
}

const ms0 = performance.now();
const dngResponse = await fetch("vending.dng");
const msResponse = performance.now();
const dng = new Uint8Array(await dngResponse.arrayBuffer());
const msBytes = performance.now();

const tiff = tiffEp.parseTIFF_EP(dng);

const msTIFF = performance.now();

const rawIFD = tiff.ifds.findLast(x => {
	const f = tiffEp.readTag(x, tiff6.TIFF6_TAG_VALUES.NewSubfileType, tiffEp.readInts);
	return f && f[0] === 0;
})!;

const msRawIFD = performance.now();

const div = document.createElement("div");
div.style.position = "relative";
div.style.width = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiffEp.readInts)![0] + "px";
div.style.height = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiffEp.readInts)![0] + "px";

document.body.appendChild(div);
div.style.background = "lime";

console.log(rawIFD);
const linearizer = new Linearizer(rawIFD);
console.log(linearizer);
for (const segment of tiffEp.readImageSegments(rawIFD)) {
	const linearized = linearizer.linearizeImageSegment(rawIFD, segment);

	const canvas = document.createElement("canvas");
	canvas.width = segment.x1 - segment.x0;
	canvas.height = segment.y1 - segment.y0;
	canvas.style.position = "absolute";
	canvas.style.left = segment.x0 + "px";
	canvas.style.top = segment.y0 + "px";
	canvas.style.background = "#" + Math.random().toString(16).substring(2, 8);
	canvas.style.imageRendering = "pixelated";
	const ctx = canvas.getContext("2d")!;

	// Draw difference data.
	for (let y = 0; y < linearized[0].length; y++) {
		for (let x = 0; x < linearized[0][y].length; x++) {
			const s = (linearized[0][y][x] * 100).toFixed(1) + "%";
			const color = `rgb(${s} ${s} ${s})`;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, 1, 1);
		}
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
