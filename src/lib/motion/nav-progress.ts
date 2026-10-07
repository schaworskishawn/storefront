/** When a click on a link should start the top progress bar: a same-site navigation to a different page. */
export function shouldStartProgress(
	click: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
	link: { href: string; target: string; download: boolean } | null,
	current: { origin: string; pathname: string },
): boolean {
	if (!link) return false;
	if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
	if (link.download || (link.target && link.target !== "_self")) return false;
	let url: URL;
	try {
		url = new URL(link.href, current.origin);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	if (url.origin !== current.origin) return false;
	// Same page (a hash jump, or a filter that changes only the query): nothing loads, so there is nothing to show progress for.
	return url.pathname !== current.pathname;
}
