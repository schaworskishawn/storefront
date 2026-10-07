// @ts-check
/**
 * What the OpenClaw worker is allowed to be asked to do, in one place. The storefront imports this file to build and check
 * jobs, and the adapter on the OpenClaw host imports the same file to refuse anything else, so the two cannot drift apart.
 * Plain JavaScript with no dependencies: it has to run on the host with nothing but Node installed.
 *
 * Phase 1 allows exactly one job type, "site.inspect": open a few public or staging pages at a desktop and a phone width,
 * take a screenshot of each, and report what the browser saw (console errors, page errors, failed requests).
 */

export const JOB_TYPES = Object.freeze({
	"site.inspect": Object.freeze({
		summary:
			"Open allowed pages at desktop and mobile widths, take screenshots, and report console errors, page errors and failed requests.",
	}),
});

export const VIEWPORTS = Object.freeze({
	desktop: Object.freeze({ width: 1440, height: 900 }),
	mobile: Object.freeze({ width: 390, height: 844 }),
});

export const LIMITS = Object.freeze({
	maxPages: 5,
	/** The whole job. */
	maxSeconds: 180,
	/** Any one browser command. */
	stepSeconds: 40,
	maxScreenshotBytes: 8 * 1024 * 1024,
	maxEntriesPerList: 20,
	maxUrlLength: 2000,
});

export const SCREENSHOT_EXTENSIONS = Object.freeze(["png", "jpg", "jpeg", "webp"]);

/** Names of files a job may produce: lower-case letters, digits, dots, dashes and underscores, with an image extension. */
export const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.(png|jpe?g|webp)$/;

const SESSION_ID = /^wai-[0-9a-f-]{36}$/;

/**
 * Checks one page address. Only plain https addresses on an allowed host are accepted: no credentials in the address, no
 * unusual port, no IP addresses, nothing local or internal, so a job can't be pointed at the host's own network.
 * @param {unknown} raw
 * @param {readonly string[]} allowedHosts hostnames, lower case; "*.example.com" allows any subdomain of example.com
 * @returns {{ ok: true, url: string, host: string } | { ok: false, reason: string }}
 */
export function validateTargetUrl(raw, allowedHosts) {
	if (typeof raw !== "string" || raw.length === 0 || raw.length > LIMITS.maxUrlLength)
		return { ok: false, reason: "That isn't a usable address." };
	let url;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, reason: `"${raw.slice(0, 80)}" isn't a web address.` };
	}
	if (url.protocol !== "https:") return { ok: false, reason: "Only https addresses are allowed." };
	if (url.username || url.password)
		return { ok: false, reason: "Addresses with a username or password aren't allowed." };
	if (url.port && url.port !== "443")
		return { ok: false, reason: "Only the standard https port is allowed." };
	const host = url.hostname.toLowerCase().replace(/\.$/, "");
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("["))
		return { ok: false, reason: "IP addresses aren't allowed." };
	if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host))
		return { ok: false, reason: "Local and internal hosts aren't allowed." };
	const allowed = allowedHosts.some((entry) =>
		entry.startsWith("*.") ? host.endsWith(entry.slice(1)) && host.length > entry.length - 1 : host === entry,
	);
	if (!allowed) return { ok: false, reason: `${host} isn't on the list of hosts the worker may open.` };
	url.hash = "";
	return { ok: true, url: url.toString(), host };
}

/**
 * Checks a whole job.
 * @param {unknown} spec
 * @param {{ allowedHosts: readonly string[] }} options
 * @returns {{ ok: true, value: { type: "site.inspect", sessionId: string, urls: string[], viewports: ("desktop" | "mobile")[] } } | { ok: false, errors: string[] }}
 */
export function validateJobSpec(spec, { allowedHosts }) {
	/** @type {string[]} */
	const errors = [];
	const s = /** @type {Record<string, unknown>} */ (spec && typeof spec === "object" ? spec : {});
	if (s.type !== "site.inspect")
		errors.push(`The job type must be one of: ${Object.keys(JOB_TYPES).join(", ")}.`);
	if (typeof s.sessionId !== "string" || !SESSION_ID.test(s.sessionId))
		errors.push("The session id is missing or isn't in the expected form.");
	const rawUrls = Array.isArray(s.urls) ? s.urls : [];
	if (rawUrls.length < 1 || rawUrls.length > LIMITS.maxPages)
		errors.push(`Give between 1 and ${LIMITS.maxPages} addresses.`);
	/** @type {string[]} */
	const urls = [];
	for (const raw of rawUrls.slice(0, LIMITS.maxPages)) {
		const checked = validateTargetUrl(raw, allowedHosts);
		if (checked.ok) {
			if (!urls.includes(checked.url)) urls.push(checked.url);
		} else errors.push(checked.reason);
	}
	const viewportInput =
		Array.isArray(s.viewports) && s.viewports.length ? s.viewports : ["desktop", "mobile"];
	/** @type {("desktop" | "mobile")[]} */
	const viewports = [];
	for (const v of viewportInput) {
		if (v === "desktop" || v === "mobile") {
			if (!viewports.includes(v)) viewports.push(v);
		} else errors.push(`Unknown viewport "${String(v).slice(0, 20)}".`);
	}
	if (errors.length) return { ok: false, errors };
	return {
		ok: true,
		value: { type: "site.inspect", sessionId: /** @type {string} */ (s.sessionId), urls, viewports },
	};
}

/**
 * Checks a finished job's result against what was asked for: every page at every viewport is present, each with a
 * screenshot that has a safe file name, a size within the limit and a SHA-256, and findings are well formed. A result that
 * doesn't pass is treated as a failed job, never as a partial success.
 * @param {unknown} result
 * @param {{ sessionId: string, urls: readonly string[], viewports: readonly string[] }} spec
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateResult(result, spec) {
	/** @type {string[]} */
	const errors = [];
	const r = /** @type {Record<string, any>} */ (result && typeof result === "object" ? result : {});
	if (r.type !== "site.inspect") errors.push("The result isn't a site inspection.");
	if (r.sessionId !== spec.sessionId) errors.push("The result belongs to a different session.");
	/** @type {any[]} */
	const pages = Array.isArray(r.pages) ? r.pages : [];
	for (const url of spec.urls) {
		const page = pages.find((/** @type {any} */ p) => p && p.url === url);
		if (!page) {
			errors.push(`No result for ${url}.`);
			continue;
		}
		for (const viewport of spec.viewports) {
			const v = Array.isArray(page.viewports)
				? page.viewports.find((/** @type {any} */ x) => x && x.viewport === viewport)
				: null;
			if (!v) {
				errors.push(`No ${viewport} result for ${url}.`);
				continue;
			}
			const shot = v.screenshot;
			if (!shot || typeof shot.file !== "string" || !FILE_NAME.test(shot.file))
				errors.push(`The ${viewport} screenshot of ${url} is missing or has an unsafe name.`);
			else if (!/^[a-f0-9]{64}$/.test(String(shot.sha256)))
				errors.push(`The ${viewport} screenshot of ${url} has no checksum.`);
			else if (!Number.isInteger(shot.bytes) || shot.bytes <= 0 || shot.bytes > LIMITS.maxScreenshotBytes)
				errors.push(`The ${viewport} screenshot of ${url} has an unusable size.`);
		}
	}
	/** @type {any[]} */
	const findings = Array.isArray(r.findings) ? r.findings : [];
	for (const f of findings) {
		if (
			!f ||
			!["info", "low", "medium", "high", "critical"].includes(f.severity) ||
			typeof f.title !== "string" ||
			typeof f.detail !== "string"
		)
			errors.push("A finding is malformed.");
	}
	return errors.length ? { ok: false, errors: errors.slice(0, 10) } : { ok: true };
}
