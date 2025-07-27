import * as color from "./color.js";
import { Linearizer } from "./dng-linear-reference.js";
import * as dng from "./dng.js";
import * as mosaic from "./mosaic.js";
import * as tiffEp from "./tiff-ep.js";
import * as tiff6 from "./tiff6.js";

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

const dngResponse = await fetch("parking.dng");

const tiff = tiffEp.parseTIFF_EP(new Uint8Array(await dngResponse.arrayBuffer()));

const rawIFD = tiff.ifds.findLast(x => {
	const f = tiffEp.readTag(x, tiff6.TIFF6_TAG_VALUES.NewSubfileType, tiffEp.readInts);
	return f && f[0] === 0;
})!;

const div = document.createElement("div");
div.style.position = "relative";
div.style.width = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiffEp.readInts)![0] + "px";
div.style.height = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiffEp.readInts)![0] + "px";

document.body.appendChild(div);
div.style.background = "lime";

const linearizer = new Linearizer(rawIFD);

const rggb = new dng.ActiveAreaPattern(linearizer.activeArea, [[0, 1], [1, 2]]);

const demosaic = new mosaic.RGGBMosaic(rggb);

const whiteBalanceCache: Map<number, color.WhiteBalance> = new Map();
function getWhiteBalance(temperatureKelvin: number): color.WhiteBalance {
	const existing = whiteBalanceCache.get(temperatureKelvin);
	if (existing) {
		return existing;
	}

	const made = new color.WhiteBalance(tiff.ifds[0], temperatureKelvin);
	whiteBalanceCache.set(temperatureKelvin, made);
	return made;
}

const whiteBalance2900 = getWhiteBalance(2900);
const whiteBalance6500 = getWhiteBalance(6500);

for (const segment of tiffEp.readImageSegments(rawIFD)) {
	const segmentLabel = `segment ${segment.x1 - segment.x0}x${segment.y1 - segment.y0}`;
	console.time(segmentLabel);
	console.time("linearizeImageSegment");
	const linearized = linearizer.linearizeImageSegment(rawIFD, segment);
	console.timeEnd("linearizeImageSegment");

	const canvas = document.createElement("canvas");
	canvas.width = segment.x1 - segment.x0;
	canvas.height = segment.y1 - segment.y0;
	canvas.style.position = "absolute";
	canvas.style.left = segment.x0 + "px";
	canvas.style.top = segment.y0 + "px";
	canvas.style.background = "#" + Math.random().toString(16).substring(2, 8);
	canvas.style.imageRendering = "pixelated";
	const ctx = canvas.getContext("2d")!;

	console.time("demosaic");
	const colorized = demosaic.demosaic(linearized[0], segment);
	console.timeEnd("demosaic");

	console.time("render");

	const whiteBalance = segment.y0 > segment.x0
		? whiteBalance2900
		: whiteBalance6500;

	console.time("rectangleToXYZ_D50_SRGB");
	const imageData = whiteBalance.rectangleToXYZ_D50_SRGB(colorized);
	console.timeEnd("rectangleToXYZ_D50_SRGB");

	console.time("putImageData");
	ctx.putImageData(imageData, 0, 0);
	console.timeEnd("putImageData");

	console.timeEnd("render");

	console.timeEnd(segmentLabel);
	console.log(whiteBalance.temperatureK);

	div.appendChild(canvas);

	await new Promise(resolve => requestAnimationFrame(resolve));
}
