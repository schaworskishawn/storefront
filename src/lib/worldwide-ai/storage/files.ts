import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { sha256Hex } from "../hash";

/**
 * File storage for uploads, inspection screenshots and backups. Production is a private Supabase Storage bucket, reached
 * over its REST API with the server-side service key; development and tests use a folder. Every write returns the file's
 * SHA-256 so a later check can prove the file read back is the file that was stored.
 */

export type StoredFile = { path: string; sha256: string; bytes: number };

export interface FileStorage {
	mode: "supabase" | "folder";
	put(path: string, data: Uint8Array, mime: string): Promise<StoredFile>;
	get(path: string): Promise<Uint8Array | null>;
	/** Every stored path under a prefix, for backups. */
	list(prefix: string): Promise<string[]>;
}

/** Storage paths are plain relative paths made of safe characters: no leading slash, no "..", no odd characters. */
export function safePath(path: string): string {
	const cleaned = path.replace(/\\/g, "/");
	if (
		!cleaned ||
		cleaned.startsWith("/") ||
		cleaned.split("/").some((part) => part === "" || part === "." || part === "..") ||
		!/^[A-Za-z0-9._\-/ ]+$/.test(cleaned)
	)
		throw new Error(`"${path}" is not a valid storage path.`);
	return cleaned;
}

// ---- A folder (development, tests, restore checks) ----------------------------------

export function createFolderStorage(root: string): FileStorage {
	const resolve = (path: string) => {
		const full = normalize(join(root, safePath(path)));
		if (!full.startsWith(normalize(root) + sep) && full !== normalize(root))
			throw new Error("Path escapes the storage folder.");
		return full;
	};
	const walk = async (dir: string, base: string): Promise<string[]> => {
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return [];
		}
		const out: string[] = [];
		for (const entry of entries) {
			const full = join(dir, entry);
			const rel = base ? `${base}/${entry}` : entry;
			if ((await stat(full)).isDirectory()) out.push(...(await walk(full, rel)));
			else out.push(rel);
		}
		return out;
	};
	return {
		mode: "folder",
		async put(path, data) {
			const full = resolve(path);
			await mkdir(dirname(full), { recursive: true });
			await writeFile(full, data);
			return { path: safePath(path), sha256: sha256Hex(data), bytes: data.byteLength };
		},
		async get(path) {
			try {
				return new Uint8Array(await readFile(resolve(path)));
			} catch {
				return null;
			}
		},
		async list(prefix) {
			return (await walk(root, "")).filter((p) => p.startsWith(prefix)).sort();
		},
	};
}

// ---- Supabase Storage ---------------------------------------------------------------------

export type SupabaseStorageOptions = {
	url: string;
	serviceKey: string;
	bucket: string;
	fetchImpl?: typeof fetch;
};

const encodePath = (path: string) => safePath(path).split("/").map(encodeURIComponent).join("/");

export function createSupabaseStorage({
	url,
	serviceKey,
	bucket,
	fetchImpl = fetch,
}: SupabaseStorageOptions): FileStorage {
	const base = `${url.replace(/\/+$/, "")}/storage/v1`;
	const auth = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
	return {
		mode: "supabase",
		async put(path, data, mime) {
			const response = await fetchImpl(`${base}/object/${bucket}/${encodePath(path)}`, {
				method: "POST",
				headers: { ...auth, "Content-Type": mime || "application/octet-stream", "x-upsert": "false" },
				body: data as BodyInit,
			});
			if (!response.ok) throw new Error(`Storage refused the upload (${response.status}).`);
			return { path: safePath(path), sha256: sha256Hex(data), bytes: data.byteLength };
		},
		async get(path) {
			const response = await fetchImpl(`${base}/object/authenticated/${bucket}/${encodePath(path)}`, {
				headers: auth,
			});
			if (response.status === 404 || response.status === 400) return null;
			if (!response.ok) throw new Error(`Storage couldn't read the file (${response.status}).`);
			return new Uint8Array(await response.arrayBuffer());
		},
		async list(prefix) {
			const out: string[] = [];
			const folders = [prefix.replace(/\/$/, "")];
			while (folders.length) {
				const folder = folders.pop() as string;
				for (let offset = 0; ; offset += 100) {
					const response = await fetchImpl(`${base}/object/list/${bucket}`, {
						method: "POST",
						headers: { ...auth, "Content-Type": "application/json" },
						body: JSON.stringify({
							prefix: folder,
							limit: 100,
							offset,
							sortBy: { column: "name", order: "asc" },
						}),
					});
					if (!response.ok) throw new Error(`Storage couldn't list files (${response.status}).`);
					const items = (await response.json()) as Array<{ name: string; id: string | null }>;
					for (const item of items) {
						const full = folder ? `${folder}/${item.name}` : item.name;
						if (item.id === null) folders.push(full);
						else out.push(full);
					}
					if (items.length < 100) break;
				}
			}
			return out.sort();
		},
	};
}

/** Creates the private bucket if it doesn't exist yet. Safe to call every time. */
export async function ensureBucket({
	url,
	serviceKey,
	bucket,
	fetchImpl = fetch,
}: SupabaseStorageOptions): Promise<void> {
	const response = await fetchImpl(`${url.replace(/\/+$/, "")}/storage/v1/bucket`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${serviceKey}`,
			apikey: serviceKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id: bucket, name: bucket, public: false }),
	});
	// 400/409 with "already exists" is fine.
	if (!response.ok && response.status !== 400 && response.status !== 409)
		throw new Error(`Couldn't create the storage bucket (${response.status}).`);
}
