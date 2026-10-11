import { NextResponse } from "next/server";
import { sha256Hex } from "@/lib/worldwide-ai/hash";
import { getTask, scopeVisibleTo } from "@/lib/worldwide-ai/tasks/repo";
import { PRIVATE_HEADERS, apiJson, authorizeApi } from "@/lib/worldwide-ai/web/api";

/**
 * Serves one private file (an inspection screenshot, an image attached to a task) to a signed-in owner or staff member.
 * Only files this application registered are served, only for a task the person may see, and only if the stored bytes still
 * match the checksum recorded when they were stored. Storage itself is never exposed to the browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
	const authorized = await authorizeApi();
	if (!authorized.ok) return authorized.response;
	const { runtime, viewer } = authorized.operator;
	const path = (await params).path.join("/");

	const { rows } = await runtime.sql.query<{ sha256: string; mime: string | null; task_id: string | null }>(
		`select sha256, mime, task_id from wai_files where path = $1 and kind in ('evidence_screenshot', 'task_upload')`,
		[path],
	);
	const file = rows[0];
	if (!file) return apiJson({ error: "Not found." }, 404);
	const task = file.task_id ? await getTask(runtime.sql, file.task_id) : null;
	// A file with no task, or one belonging to someone else's personal task, doesn't exist for this person.
	if (!task || !scopeVisibleTo(task.scope, viewer)) return apiJson({ error: "Not found." }, 404);
	if (!runtime.storage) return apiJson({ error: "File storage isn't configured." }, 503);

	const bytes = await runtime.storage.get(path);
	if (!bytes) return apiJson({ error: "The file is missing from storage." }, 404);
	if (sha256Hex(bytes) !== file.sha256)
		return apiJson(
			{ error: "The stored file no longer matches its recorded checksum, so it isn't shown." },
			409,
		);

	const mime =
		file.mime && /^image\/(png|jpeg|webp)$/.test(file.mime) ? file.mime : "application/octet-stream";
	return new NextResponse(Buffer.from(bytes), {
		status: 200,
		headers: {
			...PRIVATE_HEADERS,
			"Content-Type": mime,
			"Content-Length": String(bytes.byteLength),
			"Content-Disposition": "inline",
			"Content-Security-Policy": "default-src 'none'; sandbox",
		},
	});
}
