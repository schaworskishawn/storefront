import qrcode from "qrcode-generator";

/**
 * QR codes for referral links: the module grid from qrcode-generator, drawn here as an SVG in one of two styles.
 *
 * - **Neon:** the shop's near-black modules, drawn as dots, on a tile running cyan into pink. Dark on light, like any QR
 *   code, so every scanner reads it (light-on-dark codes look the part but many scanners can't read them).
 * - **Classic:** black on white, solid modules, for print.
 *
 * Error correction is "Q" (a quarter of the code can be lost), so the rounded modules and the frame never cost a scan.
 * The colours are written out because the SVG is downloaded and used outside the site, where its CSS isn't.
 */

export type QrStyle = "neon" | "classic";

export function qrMatrix(text: string): boolean[][] {
	const qr = qrcode(0, "Q");
	qr.addData(text, "Byte");
	qr.make();
	const n = qr.getModuleCount();
	return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

const QUIET = 4;

/** Whether a module is part of one of the three finder squares (drawn as rounded rings, not single modules). */
const inFinder = (r: number, c: number, n: number) =>
	(r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

export function qrSvg(matrix: readonly (readonly boolean[])[], style: QrStyle, size = 1024): string {
	const n = matrix.length;
	const view = n + QUIET * 2;
	const neon = style === "neon";
	const ink = neon ? "#05030a" : "#000";
	// Neon draws each module a touch smaller, so the code reads as lit dots; classic keeps them solid for print.
	const m = neon ? 0.86 : 1;
	const inset = (1 - m) / 2;
	const modules: string[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (matrix[r]![c] && !inFinder(r, c, n))
				modules.push(`M${c + QUIET + inset} ${r + QUIET + inset}h${m}v${m}h-${m}z`);
	const round = neon ? { ring: 1.6, eye: 0.8 } : { ring: 0, eye: 0 };

	const finder = (r: number, c: number) => {
		const x = c + QUIET;
		const y = r + QUIET;
		return [
			`<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="${round.ring}" fill="none" stroke="${ink}" stroke-width="1"/>`,
			`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${round.eye}" fill="${ink}"/>`,
		].join("");
	};

	const defs = neon
		? `<defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#69ebff"/><stop offset="1" stop-color="#f179fb"/></linearGradient><radialGradient id="sheen" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
		: "";
	const background = neon
		? `<rect width="${view}" height="${view}" rx="3" fill="url(#tile)"/><rect width="${view}" height="${view}" rx="3" fill="url(#sheen)"/>`
		: `<rect width="${view}" height="${view}" fill="#fff"/>`;

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" shape-rendering="geometricPrecision">`,
		defs,
		background,
		`<path d="${modules.join("")}" fill="${ink}"/>`,
		finder(0, 0),
		finder(0, n - 7),
		finder(n - 7, 0),
		`</svg>`,
	].join("");
}
