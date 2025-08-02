import * as color from "./color.js";
import { Linearizer } from "./dng-linear-reference.js";
import * as dng from "./dng.js";
import * as mosaic from "./mosaic.js";
import * as tiffEp from "./tiff-ep.js";
import * as tiff6 from "./tiff6.js";

const SHOW_MOSAIC = false;

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

const dngResponse = await fetch("concrete.dng");

const tiff = tiffEp.parseTIFF_EP(new Uint8Array(await dngResponse.arrayBuffer()));

const rawIFD = tiff.ifds.findLast(x => {
	const f = tiffEp.readTag(x, tiff6.TIFF6_TAG_VALUES.NewSubfileType, tiffEp.readInts);
	return f && f[0] === 0;
})!;

const div = document.createElement("div");
div.style.position = "relative";
div.style.width = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiffEp.readInts)![0] + "px";
div.style.height = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiffEp.readInts)![0] + "px";
div.style.overflowX = "visible";

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

	const made = new color.WhiteBalance(tiff.ifds[0], { temperatureK: temperatureKelvin, ignoreCC: true });
	whiteBalanceCache.set(temperatureKelvin, made);
	return made;
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

const pauser = new Pauser(80);

for (const segment of tiffEp.readImageSegments(rawIFD)) {
	const segmentLabel = `segment ${segment.x1 - segment.x0}x${segment.y1 - segment.y0}`;
	console.time(segmentLabel);
	console.time("linearizeImageSegment");
	const linearized = linearizer.linearizeImageSegment(rawIFD, segment);
	console.timeEnd("linearizeImageSegment");

	if (SHOW_MOSAIC) {
		const gray = document.createElement("canvas");
		gray.width = segment.x1 - segment.x0;
		gray.height = segment.y1 - segment.y0;

		const ctx = gray.getContext("2d")!;
		for (let r = 0; r < linearized[0].length; r++) {
			for (let c = 0; c < linearized[0][r].length; c++) {
				const d = Math.round(linearized[0][r][c] * 255).toFixed(0);
				ctx.fillStyle = `rgb(${d} ${d} ${d})`;
				ctx.fillRect(c, r, 1, 1);
			}
		}
		gray.style.position = "absolute";
		gray.style.left = segment.x0 + "px";
		gray.style.top = segment.y0 + "px";
		div.appendChild(gray);
	} else {
		const canvas = document.createElement("canvas");
		canvas.width = segment.x1 - segment.x0;
		canvas.height = segment.y1 - segment.y0;
		canvas.style.position = "absolute";
		canvas.style.left = segment.x0 + "px";
		canvas.style.top = segment.y0 + "px";
		canvas.style.background = "#" + Math.random().toString(16).substring(2, 8);
		canvas.style.imageRendering = "pixelated";
		const ctx = canvas.getContext("2d")!;

		const colorized = demosaic.demosaic(linearized[0], segment);
		const whiteBalance = getWhiteBalance(6500);

		const imageData = whiteBalance.rectangleToXYZ_D50_SRGB(colorized);

		ctx.putImageData(imageData.toImageData(), 0, 0);

		div.appendChild(canvas);
	}

	console.timeEnd(segmentLabel);

	await pauser.pause();
}

////////////////////////////////////////////////////////////////////////////////

// A gray region has LINEARIZED:
// 57/255, 132/255, 133/255, 84/255 (RGGB)
// R=0.22, G=0.52, B=0.33
// = 0.52 * (0.42, 1, 0.63)

// asShotNeutral: [0.439805, 1, 0.617412] -- matches perfectly.
// analogBalance: [1, 1, 1] (as expected)
// illuminant1: 17 ("Standard Light A")
// illuminant2: 21 ("D65", "noon daylight")
// So basically we will use Illuminant2.

// CM = ColorMatrix2 = [[1.0291, -0.4415, -0.0947], [-0.335, 1.1783, 0.1754], [-0.0321, 0.1667, 0.521]]
// CC = CameraCalibration2 = [[2.1561, 0, 0], [0, 1, 0], [0, 0, 1.5058]]
// AB = I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
// RM = ReductionMatrix2 is undefined
// FM = ForwardMatrix2 = [[0.3854, 0.431, 0.1479], [0.1839, 0.7724, 0.0438], [0.0717, 0.0029, 0.7505]]

// XYZtoCamera = AB * CC * CM
// = [[2.1561, 0, 0], [0, 1, 0], [0, 0, 1.5058]] * [[1.0291, -0.4415, -0.0947], [-0.335, 1.1783, 0.1754], [-0.0321, 0.1667, 0.521]]
// = [2.21884, -0.951918, -0.204183], [-0.335, 1.1783, 0.1754], [-0.0483362, 0.251017, 0.784522]]

// XYZtoCamera * (1, 1, 1) \approx
// [2.2, -0.3, 0] + [-1.0, 1.2, 0.3] + [-0.2, 0.2, 0.8] = [1, 1.1, 1.1]

// CameraNeutral = XYZtoCamera * (white balance XYZ)
// for D65, the white balance coordinate is roughly (0.95, 1.00, 1.09)
// = [[0.93], [1.05], [1.06]] which is not correct at all!

// What about ColorMatrix2 * (white balance XYZ) ?
// = [[.43], [1.05], [0.70]] --> <.41, 1.00, .67> extremely close!
