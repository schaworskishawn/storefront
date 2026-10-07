/**
 * Turns what the browser reported into findings, by rule. No model is involved: the same observations always give the same
 * findings, and every finding names the page and the width it was seen at.
 */

/**
 * @typedef {{ severity: "info" | "low" | "medium" | "high" | "critical", category: string, title: string, detail: string, url: string, viewport: string }} Finding
 */

/**
 * @param {Array<{ url: string, viewports: Array<{ viewport: string, title?: string | null, consoleErrors: {text: string}[], pageErrors: {text: string}[], failedRequests: {url: string, status: number | null}[] }> }>} pages
 * @returns {Finding[]}
 */
export function deriveFindings(pages) {
	/** @type {Finding[]} */
	const findings = [];
	for (const page of pages) {
		for (const v of page.viewports) {
			const where = { url: page.url, viewport: v.viewport };
			if (v.pageErrors.length)
				findings.push({
					...where,
					severity: "high",
					category: "site-inspection",
					title: `${v.pageErrors.length} uncaught page error${v.pageErrors.length === 1 ? "" : "s"} (${v.viewport})`,
					detail: v.pageErrors
						.map((e) => e.text)
						.slice(0, 5)
						.join("\n"),
				});
			if (v.consoleErrors.length)
				findings.push({
					...where,
					severity: v.consoleErrors.length >= 5 ? "medium" : "low",
					category: "site-inspection",
					title: `${v.consoleErrors.length} console error${v.consoleErrors.length === 1 ? "" : "s"} (${v.viewport})`,
					detail: v.consoleErrors
						.map((e) => e.text)
						.slice(0, 5)
						.join("\n"),
				});
			const server = v.failedRequests.filter((r) => r.status !== null && r.status >= 500);
			const other = v.failedRequests.filter((r) => !(r.status !== null && r.status >= 500));
			if (server.length)
				findings.push({
					...where,
					severity: "high",
					category: "site-inspection",
					title: `${server.length} request${server.length === 1 ? "" : "s"} failed with a server error (${v.viewport})`,
					detail: server
						.slice(0, 5)
						.map((r) => `${r.status} ${r.url}`)
						.join("\n"),
				});
			if (other.length)
				findings.push({
					...where,
					severity: "medium",
					category: "site-inspection",
					title: `${other.length} request${other.length === 1 ? "" : "s"} failed (${v.viewport})`,
					detail: other
						.slice(0, 5)
						.map((r) => `${r.status ?? "no response"} ${r.url}`)
						.join("\n"),
				});
			if (v.title !== undefined && !v.title)
				findings.push({
					...where,
					severity: "low",
					category: "site-inspection",
					title: `The page has no title (${v.viewport})`,
					detail: "No <title> was reported for this page.",
				});
		}
	}
	return findings;
}
