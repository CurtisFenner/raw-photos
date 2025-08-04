import * as dng from "../dng.js";
import * as tiffEp from "../tiff-ep.js";
import * as tiff6 from "../tiff6.js";
import * as t from "./t.js";

export async function renderTags(token: unknown, tiff: t.TIFF) {
	if (token !== t.latestRefresh.token) {
		return;
	}

	t.editorDiv.classList.remove("file-loading");

	const radio = document.getElementById("active-tab-image") as HTMLInputElement;
	radio.checked = true;

	t.tabTagsDiv.innerHTML = "";

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
		t.tabTagsDiv.appendChild(problemsUl);
	}

	for (const ifd of tiff.ifds) {
		const details = document.createElement("details");
		const summary = document.createElement("summary");
		const index = tiff.ifds.indexOf(ifd);
		const summarySamp = document.createElement("samp");
		summarySamp.textContent = `ImageFileDirectory ${index} (at byte ${ifd.myOffset})`;
		summary.appendChild(summarySamp);
		details.setAttribute("open", "true");

		if (t.isIFDRaw(ifd)) {
			const bold = document.createElement("b");
			bold.textContent = " Contains raw data!";
			summary.appendChild(bold);
		}

		details.appendChild(summary);

		const ul = document.createElement("ul");
		details.appendChild(ul);

		t.tabTagsDiv.appendChild(details);

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
