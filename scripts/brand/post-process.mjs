/**
 * Post-processing for rendered artwork (used by scripts/rasterize-promo-art.mjs).
 *
 * Images here are interleaved RGB, 3 values a pixel, 0–255. The renderer gives 8 bits (a Uint8Array or Buffer); every
 * step below works in floating point (Float32Array) so nothing is rounded until the very end, where `quantize` dithers
 * down to 8 bits once.
 *
 *   reduce2   halve a supersampled render with Lanczos3, each sample clamped to the source pixels under it (no halos)
 *   deband    smooth the steps 8 bits cut into long, gentle gradients; leave edges and detail alone
 *   sharpen   output sharpening on lightness, for the softness halving leaves; never darkens enough to draw a dark halo
 *   grain     film grain made in pixels, at the size it is seen, laid on like an overlay
 *   quantize  to 8 bits with triangular dither, so the smoothed gradients stay smooth
 */

/** A small, fast, seeded random number generator (mulberry32): the same seed always makes the same pixels. */
export function random(seed) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const lanczos3 = (t) => {
	if (t === 0) return 1;
	if (Math.abs(t) >= 3) return 0;
	const p = Math.PI * t;
	return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p);
};

/** The source pixels (offsets from 2 × the output index) that Lanczos3 reads when halving, and their weights. */
const TAPS = Array.from({ length: 12 }, (_, i) => i - 5);
const WEIGHTS = (() => {
	const w = TAPS.map((d) => lanczos3((d - 0.5) / 2));
	const sum = w.reduce((a, b) => a + b, 0);
	return w.map((v) => v / sum);
})();
/** The source pixels a sample is clamped to: the two it covers and one either side. */
const NEAR = (d) => d >= -1 && d <= 2;

/**
 * Halve an image (`sw` × `sh`, both even) with Lanczos3. Lanczos is sharp but rings: beside a bright line on a dark ground
 * it dips below the ground (a dark halo) and peaks above the line. So each sample is clamped to the range of the 4 × 4
 * source pixels nearest it, which keeps the sharpness and drops the halos.
 */
export function reduce2(src, sw, sh) {
	const w = sw >> 1;
	const h = sh >> 1;
	const n = TAPS.length;
	const clampIndex = (i, len) => (i < 0 ? 0 : i >= len ? len - 1 : i);
	// Across: sw × sh → w × sh, keeping each sample's nearest-source range too.
	const across = new Float32Array(w * sh * 3);
	const lo = new Float32Array(w * sh * 3);
	const hi = new Float32Array(w * sh * 3);
	const xs = new Int32Array(w * n);
	for (let x = 0; x < w; x++) for (let t = 0; t < n; t++) xs[x * n + t] = clampIndex(2 * x + TAPS[t], sw);
	for (let y = 0; y < sh; y++) {
		const row = y * sw;
		for (let x = 0; x < w; x++) {
			const o = (y * w + x) * 3;
			for (let c = 0; c < 3; c++) {
				let acc = 0;
				let mn = 255;
				let mx = 0;
				for (let t = 0; t < n; t++) {
					const v = src[(row + xs[x * n + t]) * 3 + c];
					acc += WEIGHTS[t] * v;
					if (NEAR(TAPS[t])) {
						if (v < mn) mn = v;
						if (v > mx) mx = v;
					}
				}
				across[o + c] = acc;
				lo[o + c] = mn;
				hi[o + c] = mx;
			}
		}
	}
	// Down: w × sh → w × h, then clamp.
	const out = new Float32Array(w * h * 3);
	for (let y = 0; y < h; y++) {
		const rows = TAPS.map((d) => clampIndex(2 * y + d, sh) * w);
		for (let x = 0; x < w; x++) {
			const o = (y * w + x) * 3;
			for (let c = 0; c < 3; c++) {
				let acc = 0;
				let mn = 255;
				let mx = 0;
				for (let t = 0; t < n; t++) {
					const i = (rows[t] + x) * 3 + c;
					acc += WEIGHTS[t] * across[i];
					if (NEAR(TAPS[t])) {
						if (lo[i] < mn) mn = lo[i];
						if (hi[i] > mx) mx = hi[i];
					}
				}
				out[o + c] = acc < mn ? mn : acc > mx ? mx : acc;
			}
		}
	}
	return out;
}

/** Blur each of `channels` interleaved channels with a box of radius r, twice across and twice down (close to a Gaussian). */
function boxBlur(img, w, h, r, channels) {
	const tmp = new Float32Array(img.length);
	const out = new Float32Array(img.length);
	const norm = 1 / (2 * r + 1);
	const pass = (inp, dst, across) => {
		const len = across ? w : h;
		const lines = across ? h : w;
		const step = across ? channels : w * channels;
		for (let l = 0; l < lines; l++) {
			const base = across ? l * w * channels : l * channels;
			for (let c = 0; c < channels; c++) {
				const at = (i) => inp[base + (i < 0 ? 0 : i >= len ? len - 1 : i) * step + c];
				let acc = 0;
				for (let i = -r; i <= r; i++) acc += at(i);
				for (let i = 0; i < len; i++) {
					dst[base + i * step + c] = acc * norm;
					acc += at(i + r + 1) - at(i - r);
				}
			}
		}
	};
	pass(img, tmp, true);
	pass(tmp, out, false);
	pass(out, tmp, true);
	pass(tmp, out, false);
	return out;
}

/**
 * Deband (after ffmpeg's gradfun). An 8-bit render of a long, gentle gradient is a staircase of flat bands one level apart;
 * blurred, it is the smooth ramp it should be. So where a pixel is within `full` levels of its blurred self it takes the
 * blurred value, fading back to itself by `cutoff` levels; edges, lines and detail differ by far more and are untouched.
 * `radius` (pixels) should be at least the width of a band.
 */
export function deband(img, w, h, radius, { full = 1, cutoff = 2.5 } = {}) {
	const smooth = boxBlur(img, w, h, radius, 3);
	const out = new Float32Array(img.length);
	for (let i = 0; i < img.length; i++) {
		const d = smooth[i] - img[i];
		const a = Math.abs(d);
		const k = a <= full ? 1 : a >= cutoff ? 0 : 1 - (a - full) / (cutoff - full);
		out[i] = img[i] + k * k * d;
	}
	return out;
}

/** Rec. 709 lightness of each pixel. */
const luma = (img, w, h) => {
	const y = new Float32Array(w * h);
	for (let p = 0, i = 0; p < w * h; p++, i += 3)
		y[p] = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
	return y;
};

/** Gaussian blur of a single-channel image. */
function gaussian(img, w, h, sigma) {
	const r = Math.max(1, Math.ceil(sigma * 3));
	const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
	const sum = k.reduce((a, b) => a + b, 0);
	for (let i = 0; i < k.length; i++) k[i] /= sum;
	const tmp = new Float32Array(img.length);
	const out = new Float32Array(img.length);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let acc = 0;
			for (let j = -r; j <= r; j++) acc += k[j + r] * img[y * w + Math.min(w - 1, Math.max(0, x + j))];
			tmp[y * w + x] = acc;
		}
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let acc = 0;
			for (let j = -r; j <= r; j++) acc += k[j + r] * tmp[Math.min(h - 1, Math.max(0, y + j)) * w + x];
			out[y * w + x] = acc;
		}
	return out;
}

/**
 * Unsharp mask on lightness, the same lift added to all three channels so colours don't shift. Differences under
 * `threshold` levels (smooth gradients, grain) are left alone, and no pixel is darkened by more than `maxDark` levels, so
 * the dark side of a neon line gets no halo.
 */
export function sharpen(img, w, h, { sigma = 0.6, amount = 0.35, threshold = 2, maxDark = 2 } = {}) {
	const y = luma(img, w, h);
	const blurred = gaussian(y, w, h, sigma);
	const out = new Float32Array(img.length);
	for (let p = 0, i = 0; p < w * h; p++, i += 3) {
		const d = y[p] - blurred[p];
		const lift = Math.abs(d) < threshold ? 0 : Math.max(-maxDark, amount * d);
		out[i] = img[i] + lift;
		out[i + 1] = img[i + 1] + lift;
		out[i + 2] = img[i + 2] + lift;
	}
	return out;
}

/**
 * Grey film grain, made in pixels: white noise blurred to grains about `size` pixels across (1 for a 1× screen, 2 for a
 * 2× one, so it looks the same once displayed) and scaled back to one unit of spread. It is laid on like an overlay
 * blend: a pixel moves by `2 × strength × noise × min(v, 255 − v)`, most in the mid-tones and least in the darks and in
 * the brightest light.
 */
export function grain(img, w, h, { size = 1, strength, seed }) {
	const rand = random(seed);
	let noise = new Float32Array(w * h);
	for (let i = 0; i < noise.length; i++) {
		const u = Math.max(rand(), 1e-12);
		noise[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); // Box–Muller: normal, spread 1
	}
	if (size > 1) {
		noise = gaussian(noise, w, h, size / 2);
		let sq = 0;
		for (const v of noise) sq += v * v;
		const spread = Math.sqrt(sq / noise.length);
		for (let i = 0; i < noise.length; i++) noise[i] /= spread;
	}
	const out = new Float32Array(img.length);
	for (let p = 0, i = 0; p < w * h; p++, i += 3) {
		const k = 2 * strength * noise[p];
		for (let c = 0; c < 3; c++) {
			const v = img[i + c];
			out[i + c] = v + k * Math.min(v, 255 - v);
		}
	}
	return out;
}

/** To 8 bits, once, with triangular dither (±1 level), so a gradient between two levels mixes them instead of stepping. */
export function quantize(img, seed) {
	const rand = random(seed);
	const out = Buffer.alloc(img.length);
	for (let i = 0; i < img.length; i++) {
		const v = Math.round(img[i] + rand() - rand());
		out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
	}
	return out;
}

/** Halve an image by averaging each 2 × 2 block: the colour exactly as rendered, with no sharpening and no ringing. */
export function average2(src, sw, sh) {
	const w = sw >> 1;
	const h = sh >> 1;
	const out = new Float32Array(w * h * 3);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++)
			for (let c = 0; c < 3; c++) {
				const i = (2 * y * sw + 2 * x) * 3 + c;
				out[(y * w + x) * 3 + c] = (src[i] + src[i + 3] + src[i + sw * 3] + src[i + sw * 3 + 3]) / 4;
			}
	return out;
}

/** The mean of each channel in a `cols` × `rows` grid of cells: [r, g, b] per cell, row by row. */
export function cellMeans(img, w, h, cols, rows) {
	const cells = [];
	for (let cy = 0; cy < rows; cy++)
		for (let cx = 0; cx < cols; cx++) {
			const x0 = Math.floor((cx * w) / cols);
			const x1 = Math.floor(((cx + 1) * w) / cols);
			const y0 = Math.floor((cy * h) / rows);
			const y1 = Math.floor(((cy + 1) * h) / rows);
			const sum = [0, 0, 0];
			for (let y = y0; y < y1; y++)
				for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) sum[c] += img[(y * w + x) * 3 + c];
			const n = (x1 - x0) * (y1 - y0);
			cells.push(sum.map((s) => s / n));
		}
	return cells;
}

/**
 * Dark halos: the share of samples in a halved image (`out`, w × h) darker by more than `tolerance` levels than every
 * source pixel near it (`src`, 2w × 2h).
 */
export function darkHalos(out, src, w, h, tolerance) {
	let count = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++)
			for (let c = 0; c < 3; c++) {
				let mn = 255;
				for (let sy = Math.max(0, 2 * y - 1); sy <= Math.min(2 * h - 1, 2 * y + 2); sy++)
					for (let sx = Math.max(0, 2 * x - 1); sx <= Math.min(2 * w - 1, 2 * x + 2); sx++) {
						const v = src[(sy * 2 * w + sx) * 3 + c];
						if (v < mn) mn = v;
					}
				if (out[(y * w + x) * 3 + c] < mn - tolerance) count++;
			}
	return count / (w * h * 3);
}
