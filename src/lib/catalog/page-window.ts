/**
 * The page numbers to show in a pagination row, so a long result list doesn't print a button for every page: always the
 * first and the last, the current page with `siblings` either side of it, and a `"gap"` (drawn as an ellipsis) wherever
 * pages are skipped. A gap would only ever hide one page, so that page is shown instead. At most `5 + 2 * siblings`
 * entries, however many pages there are.
 *
 * pageWindow(9, 17) → [1, "gap", 8, 9, 10, "gap", 17]
 * pageWindow(1, 17) → [1, 2, "gap", 17]
 */
export function pageWindow(current: number, count: number, siblings = 1): Array<number | "gap"> {
	if (count < 1) return [];
	const page = Math.min(Math.max(Math.round(current), 1), count);
	const shown = new Set([1, count]);
	for (let n = page - siblings; n <= page + siblings; n++) if (n >= 1 && n <= count) shown.add(n);

	const row: Array<number | "gap"> = [];
	let previous = 0;
	for (const n of [...shown].sort((a, b) => a - b)) {
		if (n - previous === 2) row.push(previous + 1);
		else if (n - previous > 2) row.push("gap");
		row.push(n);
		previous = n;
	}
	return row;
}
