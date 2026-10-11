import { getProductByTask } from "@/lib/worldwide-ai/functions/products";
import { getTask, scopeVisibleTo } from "@/lib/worldwide-ai/tasks/repo";
import { apiJson, authorizeApi } from "@/lib/worldwide-ai/web/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where one task stands, for a signed-in owner or staff member: its state, and the id of its result once there is one. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const authorized = await authorizeApi();
	if (!authorized.ok) return authorized.response;
	const { runtime, viewer } = authorized.operator;
	const { id } = await params;
	if (!UUID.test(id)) return apiJson({ error: "Not found." }, 404);
	const task = await getTask(runtime.sql, id);
	if (!task || !scopeVisibleTo(task.scope, viewer)) return apiJson({ error: "Not found." }, 404);
	const product = await getProductByTask(runtime.sql, id);
	return apiJson({
		id: task.id,
		kind: task.kind,
		owner: task.ownerRole,
		state: task.state,
		title: task.title,
		error: task.error,
		demo: task.demo,
		updatedAt: task.updatedAt,
		finishedAt: task.finishedAt,
		resultId: product?.id ?? null,
		verified: task.state === "completed" && task.completionEvidence !== null,
	});
}
