import { ActiveArea, ActiveAreaPattern, DNGError, isPositive, readRealRectangles, readRealsTagExpectingSize } from "./dng.js";
import * as jpeg from "./jpeg.js";
import * as tiffEp from "./tiff-ep.js";
import { TIFF6_TAG_VALUES } from "./tiff6.js";

/** From "Mapping Raw Values to Linear Reference Values" in DNG Spec 1.7.1.0 */
export class Linearizer {
	readonly activeArea: ActiveArea;
	/** SamplesPerPixel */
	readonly componentCount: number;

	/** BitsPerSample */
	readonly bitsPerSample: number;

	/** BlackLevel [component][y - activeAreaTop][x - activeAreaLeft].
	 * Dimensions from BlackLevelRepeatDim
	 */
	private blackLevelPatternByComponent: ActiveAreaPattern[];

	/** BlackLevelDeltaH [x - activeAreaLeft] */
	private blackLevelByColumn: ActiveAreaPattern;

	/** BlackLevelDeltaV [y - activeAreaTop] */
	private blackLevelByRow: ActiveAreaPattern;

	private maxBlackLevelByComponent: number[];

	private whiteLevelByComponent: number[];
	private whiteLevelScalingByComponent: number[];

	getBlackLevel(component: number, row: number, column: number): number {
		const fromPattern = this.blackLevelPatternByComponent[component].getPixel(row, column);
		const fromRow = this.blackLevelByRow.getPixel(row, column);
		const fromColumn = this.blackLevelByColumn.getPixel(row, column);
		return fromPattern + fromColumn + fromRow;
	}

	constructor(rawIFD: tiffEp.ImageFileDirectory) {
		this.activeArea = new ActiveArea(rawIFD);
		this.componentCount = readRealsTagExpectingSize(rawIFD, "SamplesPerPixel", 1, { requires: isPositive })[0];

		const bitsPerSample = tiffEp.readTag(rawIFD, TIFF6_TAG_VALUES.BitsPerSample, tiffEp.readInts);
		if (!bitsPerSample || new Set(bitsPerSample).size !== 1 || bitsPerSample[0] < 2 || bitsPerSample[0] > 32) {
			throw new DNGError("invalid BitsPerSample");
		}
		this.bitsPerSample = bitsPerSample[0];

		const blackLevelRepeatDim = readRealsTagExpectingSize(
			rawIFD,
			"BlackLevelRepeatDim",
			2,
			{ default: 1, requires: isPositive },
		) as [number, number];

		const blackLevelPatternByComponent = readRealRectangles<3>(
			rawIFD,
			"BlackLevel",
			[blackLevelRepeatDim[0], blackLevelRepeatDim[1], this.componentCount],
			{ default: 0 },
		);

		this.blackLevelPatternByComponent = [];
		for (let component = 0; component < this.componentCount; component++) {
			const pattern: number[][] = [];
			for (let r = 0; r < blackLevelPatternByComponent.length; r++) {
				pattern[r] = [];
				for (let c = 0; c < blackLevelPatternByComponent[r].length; c++) {
					pattern[r][c] = blackLevelPatternByComponent[r][c][component];
				}
			}
			this.blackLevelPatternByComponent[component] = new ActiveAreaPattern(this.activeArea, pattern);
		}

		this.blackLevelByRow = new ActiveAreaPattern(
			this.activeArea,
			readRealRectangles<2>(rawIFD, "BlackLevelDeltaV", [this.activeArea.activeAreaHeight, 1], { default: 0 })
		);
		this.blackLevelByColumn = new ActiveAreaPattern(
			this.activeArea,
			readRealRectangles<2>(rawIFD, "BlackLevelDeltaH", [1, this.activeArea.activeAreaWidth], { default: 0 })
		);

		this.whiteLevelByComponent = readRealsTagExpectingSize(rawIFD, "WhiteLevel", this.componentCount, {
			default: 2 ** this.bitsPerSample - 1,
			requires: isPositive,
		});

		this.maxBlackLevelByComponent = [];
		this.whiteLevelScalingByComponent = [];
		for (let component = 0; component < this.componentCount; component++) {
			for (let row = this.activeArea.activeAreaTop; row < this.activeArea.activeAreaBottom; row++) {
				for (let column = this.activeArea.activeAreaLeft; column < this.activeArea.activeAreaRight; column++) {
					this.maxBlackLevelByComponent[component] = Math.max(
						this.maxBlackLevelByComponent[component] ?? 0,
						this.getBlackLevel(component, row, column),
					);
				}
			}

			this.whiteLevelScalingByComponent[component] = this.whiteLevelByComponent[component] - this.maxBlackLevelByComponent[component];
		}
	}

	linearize(
		samples: number[][][],
		topLeft: { top: number, left: number },
	): number[][][] {
		if (samples.length !== this.componentCount) {
			throw new Error("invalid component count");
		}

		const out: number[][][] = [];
		for (let component = 0; component < samples.length; component++) {
			out[component] = [];
			for (let row = 0; row < samples[component].length; row++) {
				out[component][row] = [];
				for (let column = 0; column < samples[component][row].length; column++) {
					const sample = samples[component][row][column];
					const blackLevel = this.getBlackLevel(component, topLeft.top + row, topLeft.left + column);
					const subtracted = sample - blackLevel;
					const scaling = this.whiteLevelScalingByComponent[component];
					const linearized = subtracted / scaling;
					out[component][row][column] = linearized;
				}
			}
		}
		return out;
	}

	/** [c][y][x] */
	sampleImageSegment(
		rawIFD: tiffEp.ImageFileDirectory,
		segment: { x0: number, y0: number, x1: number, y1: number, offset: number, byteCount: number },
	): number[][][] {
		const slice = rawIFD.scanner.getSlice(segment);
		const jpegData = jpeg.decodeJPEG(slice);

		const dataByComponent = jpegData.differences
			.map(x => jpeg.applyLosslessPredictor(jpegData.sof3Header, jpegData.sosHeader, x));

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
		const segmentHeight = segment.y1 - segment.y0;
		const segmentArea = segmentWidth * segmentHeight;
		if (segmentArea * this.componentCount !== jpegComponentsSequential.length) {
			throw new DNGError(
				`unexpected sequential size mismatch: ${segmentArea * this.componentCount} vs ${jpegComponentsSequential.length}`,
			);
		}
		const shaped: number[][][] = [];
		{
			let i = 0;
			for (let y = 0; y < segmentHeight; y++) {
				for (let x = 0; x < segmentWidth; x++) {
					for (let c = 0; c < this.componentCount; c++) {
						shaped[c] = shaped[c] || [];
						shaped[c][y] = shaped[c][y] || [];
						shaped[c][y][x] = jpegComponentsSequential[i];
						i += 1;
					}
				}
			}
		}

		return shaped;
	}

	linearizeImageSegment(
		rawIFD: tiffEp.ImageFileDirectory,
		segment: { x0: number, y0: number, x1: number, y1: number, offset: number, byteCount: number },
	) {
		const sample = this.sampleImageSegment(rawIFD, segment);
		return this.linearize(sample, {
			top: segment.y0,
			left: segment.x0,
		});
	}
}
