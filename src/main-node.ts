import * as fs from "node:fs";
import { FIELD_TYPES, parseTIFF_EP, readASCII, readImageSegments, readInts, readReals, readTag } from "./tiff-ep.js";
import { DNG_TAGS } from "./dng.js";
import { TIFF6_TAG_VALUES, TIFF6_TAGS } from "./tiff6.js";
import { decodeJPEG } from "./jpeg.js";

const dng = fs.readFileSync("vending.dng");

const out = parseTIFF_EP(dng);
console.log("problems:", out.problems);
console.log("#ifds:", out.ifds.length);
for (let i = 0; i < out.ifds.length; i++) {
	const ifd = out.ifds[i];
	console.log(`-- ifd ${i} (${ifd.myOffset} <- ${ifd.parentOffset}): `.padEnd(120, "-"));
	if (ifd.entries.length === 0) {
		console.log(`\t<no entries>`);
	}
	for (let k = 0; k < ifd.entries.length; k++) {
		const entry = ifd.entries[k];
		const info = FIELD_TYPES[entry.fieldType as keyof typeof FIELD_TYPES];
		const typeDescription = !info
			? `unknown type ${entry.fieldType}`
			: info.name;

		const dngTag = DNG_TAGS[entry.tag as keyof typeof DNG_TAGS]
			|| TIFF6_TAGS[entry.tag as keyof typeof TIFF6_TAGS];

		const tagName = dngTag
			? dngTag.name
			: entry.tag.toFixed(0);

		console.log(`\t${tagName}: ${typeDescription} * ${entry.valueCount}`);

		const ascii = readASCII(out.scanner, entry);
		if (ascii) {
			console.log(`\t\t${JSON.stringify(ascii)}`);
		}

		const ints = readInts(out.scanner, entry);
		if (ints) {
			if (ints.length > 16) {
				console.log(`\t\t[${ints.slice(0, 16).join(", ")}, ...]`);
			} else {
				console.log(`\t\t[${ints.join(", ")}]`);
			}
		}

		const reals = readReals(out.scanner, entry);
		if (reals) {
			if (reals.length > 8) {
				console.log(`\t\t[${reals.slice(0, 8).join(", ")}, ...]`);
			} else {
				console.log(`\t\t[${reals.join(", ")}]`);
			}
		}
	}
}

const rawIfd = out.ifds.findLast(x => {
	const f = readTag(x, TIFF6_TAG_VALUES.NewSubfileType, out.scanner, readInts);
	return f && f[0] === 0;
})!;

for (const segment of readImageSegments(out.scanner, rawIfd)) {
	const slice = out.scanner.getSlice(segment);
	console.log("-".repeat(80));
	console.log(segment);
	console.log(slice);
	const markers = decodeJPEG(slice);
}
