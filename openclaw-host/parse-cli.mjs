import { LIMITS, SCREENSHOT_EXTENSIONS } from "./job-spec.mjs";

/**
 * Reads what the `openclaw browser` commands print. OpenClaw's CLI documents `--json` output and says `screenshot` prints a
 * file path by default, but not the exact shape of each reply, so every reader here is tolerant of reasonable variations and
 * strict about the one thing that matters: if the evidence can't be found, say so, and let the job fail instead of guessing.
 *
 * NOT VERIFIED against a live OpenClaw host. If a command's output differs from what these readers expect, the adapter's
 * tests (parse-cli.test.mjs) are where to add the real sample.
 */

/**
 * JSON from a command's output, tolerating log lines before it. Null if there is none.
 * @param {any} stdout
 * @returns {any}
 */
export function parseJson(stdout) {
	const text = String(stdout ?? "").trim();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		const start = text.search(/[[{]/);
		if (start < 0) return null;
		// Try progressively from the first bracket to each later closing bracket on a line end.
		const candidate = text.slice(start);
		try {
			return JSON.parse(candidate);
		} catch {
			return null;
		}
	}
}

const IMAGE_PATH = new RegExp(
	`^(?:[A-Za-z]:)?[\\\\/][^\\0\\n\\r]+\\.(?:${SCREENSHOT_EXTENSIONS.join("|")})$`,
	"i",
);

/**
 * Where a screenshot command says it saved the file, or null.
 * @param {any} stdout
 * @returns {string | null}
 */
export function findScreenshotPath(stdout) {
	const parsed = parseJson(stdout);
	if (parsed && typeof parsed === "object") {
		const queue = [parsed];
		while (queue.length) {
			const node = /** @type {any} */ (queue.shift());
			if (!node || typeof node !== "object") continue;
			for (const key of ["path", "file", "filePath", "filename", "savedTo", "output"]) {
				if (typeof node[key] === "string" && IMAGE_PATH.test(node[key])) return node[key];
			}
			for (const value of Object.values(node)) if (value && typeof value === "object") queue.push(value);
		}
	}
	for (const line of String(stdout ?? "").split(/\r?\n/)) {
		const candidate = line
			.trim()
			.replace(/^["']|["']$/g, "")
			.replace(/^(?:saved|screenshot|path|file)[:=]\s*/i, "");
		if (IMAGE_PATH.test(candidate)) return candidate;
	}
	return null;
}

/** @param {any} value @param {number} [max] */
const clip = (value, max = 300) =>
	String(value ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);

/**
 * The list inside a reply: the reply itself if it is an array, else the first array-valued property.
 * @param {any} parsed
 * @returns {any[]}
 */
function listIn(parsed) {
	if (Array.isArray(parsed)) return parsed;
	if (parsed && typeof parsed === "object")
		for (const value of Object.values(parsed)) if (Array.isArray(value)) return value;
	return [];
}

/**
 * Console or page error entries as `{ text }`.
 * @param {any} stdout
 * @returns {{ text: string }[]}
 */
export function readMessages(stdout) {
	return listIn(parseJson(stdout))
		.slice(0, LIMITS.maxEntriesPerList)
		.map((entry) => ({
			text: clip(
				typeof entry === "string"
					? entry
					: (entry?.text ?? entry?.message ?? entry?.error ?? JSON.stringify(entry)),
			),
		}))
		.filter((entry) => entry.text);
}

/**
 * Requests that failed or came back with an error status, as `{ url, status }`.
 * @param {any} stdout
 */
export function readFailedRequests(stdout) {
	/** @type {{ url: string, status: number | null }[]} */
	const failed = [];
	for (const entry of listIn(parseJson(stdout))) {
		if (!entry || typeof entry !== "object") continue;
		const e = /** @type {any} */ (entry);
		const raw = e.status ?? e.statusCode ?? e.response?.status;
		const status = Number.isFinite(Number(raw)) && raw !== null && raw !== "" ? Number(raw) : null;
		const errored =
			e.failed === true || Boolean(e.error) || Boolean(e.errorText) || (status !== null && status >= 400);
		if (errored && typeof e.url === "string") failed.push({ url: clip(e.url, 400), status });
		if (failed.length >= LIMITS.maxEntriesPerList) break;
	}
	return failed;
}

/**
 * The page title from an `open` or `tabs` reply, if it says one.
 * @param {any} stdout
 * @returns {string | null}
 */
export function readTitle(stdout) {
	const parsed = /** @type {any} */ (parseJson(stdout));
	const title = parsed?.title ?? parsed?.tab?.title ?? listIn(parsed)[0]?.title;
	return typeof title === "string" ? clip(title, 200) : null;
}
