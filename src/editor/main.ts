import * as tiffEp from "../tiff-ep.js";
import { renderImagePreview } from "./renderImagePreview.js";
import { renderTags } from "./renderTags.js";
import * as t from "./t.js";

function markEditorLoading(
	token: unknown,
	loading: { fileName: string; sizeBytes: number }
) {
	if (token !== t.latestRefresh.token) {
		return;
	}
	t.editorDiv.classList.remove("file-error");
	t.editorDiv.classList.add("file-loading");
}

function reportError(token: unknown, err: unknown) {
	if (token !== t.latestRefresh.token) {
		return;
	}
	t.editorDiv.classList.remove("file-loading");
	t.editorDiv.classList.add("file-error");

	const radio = document.getElementById(
		"active-tab-tags"
	) as HTMLInputElement;
	radio.checked = true;

	// t.tabTagsDiv.innerHTML = "";

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

	t.tabTagsDiv.appendChild(details);
}

async function loadFile(token: unknown, file: File) {
	t.latestRefresh.token = token;
	markEditorLoading(token, {
		fileName: file.name,
		sizeBytes: file.size,
	});

	try {
		const fileBytes = await file.arrayBuffer();

		const tiff = tiffEp.parseTIFF_EP(new Uint8Array(fileBytes));

		const rawIFD = tiff.ifds.findLast(t.isIFDRaw)!;
		if (!rawIFD) {
			throw new Error("No raw ImageFileDirectory found!");
		}

		await renderTags(token, tiff);
		await renderImagePreview(token, tiff, (err) => {
			reportError(token, err);
		});
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

	document.body.addEventListener("dragover", (e) => {
		// Allow drag-and-drop files onto the body.
		e.preventDefault();
	});

	document.body.addEventListener("drop", (e) => {
		e.preventDefault();

		const dt = new DataTransfer();
		if (e.dataTransfer?.files) {
			fileInput.files = e.dataTransfer.files;
			fileInput.dispatchEvent(new Event("change"));
		}
	});
}

main();
