import * as data from "../data.js";
import * as dng from "../dng.js";
import * as tiffEp from "../tiff-ep.js";
import * as tiff6 from "../tiff6.js";

const editorDiv = document.getElementById("editor-div") as HTMLDivElement;
const tabTagsDiv = document.getElementById("tab-tags-div") as HTMLDivElement;
const tabImageDiv = document.getElementById("tab-image-div") as HTMLDivElement;

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

async function renderTags(token: unknown, tiff: {
	byteOrder: "big-endian" | "little-endian";
	ifds: tiffEp.ImageFileDirectory[];
	problems: string[];
	scanner: data.Scanner;
}) {
	if (token !== latestToken) {
		return;
	}

	editorDiv.classList.remove("file-loading");

	const radio = document.getElementById("active-tab-tags") as HTMLInputElement;
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
			throw new Error("No raw IFD found!");
		}

		const widthPx = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageWidth, tiffEp.readInts)![0];
		const heightPx = tiffEp.readTag(rawIFD, tiff6.TIFF6_TAG_VALUES.ImageLength, tiffEp.readInts)![0];

		await renderTags(token, tiff);
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

