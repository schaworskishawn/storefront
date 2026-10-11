import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authorizeApi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/worldwide-ai/web/api", async (original) => ({
	...(await original<typeof import("@/lib/worldwide-ai/web/api")>()),
	authorizeApi,
}));

import type { SqlClient } from "@/lib/worldwide-ai/db/sql";
import { requestFunction } from "@/lib/worldwide-ai/functions/pipeline";
import { lookupFunction } from "@/lib/worldwide-ai/functions/registry";
import { sha256Hex } from "@/lib/worldwide-ai/hash";
import { createFolderStorage, type FileStorage } from "@/lib/worldwide-ai/storage/files";
import { personalScopeOf } from "@/lib/worldwide-ai/tasks/repo";
import { freshDb, mockModel, owner, staff, workflowDeps } from "@/lib/worldwide-ai/testing.test-util";
import { actorKey, type OperatorActor } from "@/lib/worldwide-ai/types";
import { apiJson } from "@/lib/worldwide-ai/web/api";
import { GET } from "./route";

vi.setConfig({ testTimeout: 60_000 });

const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("a private screenshot")]);
let sql: SqlClient;
let dir: string;
let storage: FileStorage;
let path: string;
let taskId: string;

const signedInAs = (actor: OperatorActor, files: FileStorage | null = storage) =>
	authorizeApi.mockResolvedValue({
		ok: true,
		operator: { actor, viewer: actorKey(actor), config: {}, runtime: { sql, storage: files } },
	});
const ask = (filePath: string) =>
	GET(new Request(`http://localhost/api/worldwide-ai/file?path=${encodeURIComponent(filePath)}`));

beforeAll(async () => {
	sql = await freshDb();
	dir = await mkdtemp(join(tmpdir(), "wai-file-route-"));
	storage = createFolderStorage(dir);
	const asked = await requestFunction(
		// A configuration in which the database and the model are set up (the test supplies both itself).
		{
			...workflowDeps(sql, mockModel({}).handle, {
				POSTGRES_URL: "postgres://test",
				ANTHROPIC_API_KEY: "sk-ant-test",
			}),
			storage,
		},
		staff,
		"prism.design-review",
		{ screen: "Review screen", viewport: "desktop", goal: "Decide whether to save" },
		{
			lookup: lookupFunction,
			files: [{ field: "screenshots", name: "review.png", mime: "image/png", bytes: png }],
		},
	);
	taskId = asked.task.id;
	path = (asked.task.input.uploads as Array<{ path: string }>)[0].path;
});
afterAll(async () => {
	await sql.close();
	await rm(dir, { recursive: true, force: true });
});

describe("the private file address", () => {
	it("is named so the site's public image-cache rule can never match it", () => {
		expect(path).toMatch(/\.png$/);
		// next.config.js gives every address whose *path* ends in an image extension a month of public caching.
		const url = new URL(`http://localhost/api/worldwide-ai/file?path=${encodeURIComponent(path)}`);
		expect(url.pathname).toBe("/api/worldwide-ai/file");
	});

	it("turns away someone who isn't signed in, without touching storage", async () => {
		authorizeApi.mockResolvedValue({ ok: false, response: apiJson({ error: "Sign in first." }, 401) });
		const response = await ask(path);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({ error: "Sign in first." });
	});

	it("serves a registered file to a signed-in person, privately and as an inert image", async () => {
		signedInAs(staff);
		const response = await ask(path);
		expect(response.status).toBe(200);
		expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			"cache-control": "private, no-store",
			"content-type": "image/png",
			"content-length": String(png.byteLength),
			"content-security-policy": "default-src 'none'; sandbox",
			"referrer-policy": "no-referrer",
			"x-content-type-options": "nosniff",
			"x-robots-tag": "noindex, nofollow",
		});
	});

	it("doesn't serve anything it wasn't asked to register for viewing", async () => {
		signedInAs(owner);
		for (const unknown of ["uploads/nothing-here.png", "../.env.local", "uploads/../../secret.png", ""])
			expect((await ask(unknown)).status, unknown).toBe(404);

		// A backup is a registered file, and it is in storage, but it is not something the browser may fetch.
		const backup = Buffer.from(JSON.stringify({ tables: {} }));
		await storage.put("backups/2026-10-11.json", backup, "application/json");
		await sql.query(
			`insert into wai_files (bucket, path, sha256, bytes, mime, kind) values ('private', $1, $2, $3, 'application/json', 'backup')`,
			["backups/2026-10-11.json", sha256Hex(backup), backup.byteLength],
		);
		expect((await ask("backups/2026-10-11.json")).status).toBe(404);
	});

	it("hides a file that belongs to someone else's personal task", async () => {
		await sql.query(`update wai_tasks set scope = $2 where id = $1`, [
			taskId,
			personalScopeOf(actorKey(owner)),
		]);
		signedInAs(staff);
		expect((await ask(path)).status).toBe(404);
		signedInAs(owner);
		expect((await ask(path)).status).toBe(200);
		await sql.query(`update wai_tasks set scope = 'business' where id = $1`, [taskId]);
	});

	it("says so when file storage isn't configured", async () => {
		signedInAs(staff, null);
		const response = await ask(path);
		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("refuses a file whose stored bytes no longer match the recorded checksum", async () => {
		await writeFile(join(dir, ...path.split("/")), Buffer.concat([png, Buffer.from("tampered")]));
		signedInAs(staff);
		const response = await ask(path);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "The stored file no longer matches its recorded checksum, so it isn't shown.",
		});
	});
});
