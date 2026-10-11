import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedPglite } from "./pglite";
import { SCHEMA_VERSION, type SqlClient } from "./sql";

let sql: SqlClient;

beforeAll(async () => {
	sql = await createMigratedPglite();
}, 60_000);

afterAll(async () => {
	await sql.close();
});

const task = (overrides: Record<string, string | null> = {}) => {
	const v = {
		kind: "relay.support_draft",
		title: "t",
		owner_role: "relay",
		idempotency_key: crypto.randomUUID(),
		requested_by: "operator:u1",
		expected_result: "a draft",
		...overrides,
	};
	return sql.query<{ id: string }>(
		`insert into wai_tasks (kind, title, owner_role, idempotency_key, requested_by, expected_result)
		 values ($1,$2,$3,$4,$5,$6) returning id`,
		[v.kind, v.title, v.owner_role, v.idempotency_key, v.requested_by, v.expected_result],
	);
};

describe("the Worldwide AI schema", () => {
	it("creates every table", async () => {
		const { rows } = await sql.query<{ table_name: string }>(
			"select table_name from information_schema.tables where table_schema = 'public' and table_name like 'wai_%'",
		);
		expect(rows.map((r) => r.table_name).sort()).toEqual([
			"wai_agent_settings",
			"wai_audit_log",
			"wai_batch_allocations",
			"wai_batches",
			"wai_cases",
			"wai_daily_reports",
			"wai_document_versions",
			"wai_documents",
			"wai_draft_sources",
			"wai_drafts",
			"wai_files",
			"wai_findings",
			"wai_ingredient_lots",
			"wai_ingredients",
			"wai_integration_health",
			"wai_meta",
			"wai_openclaw_runs",
			"wai_recipe_versions",
			"wai_recipes",
			"wai_reviews",
			"wai_skill_evaluations",
			"wai_skill_invocations",
			"wai_skill_proposals",
			"wai_skill_releases",
			"wai_stock_movements",
			"wai_task_events",
			"wai_tasks",
			"wai_usage",
			"wai_work_products",
		]);
	});

	it("locks every table to the server with row level security", async () => {
		const { rows } = await sql.query<{ relname: string; relrowsecurity: boolean }>(
			"select relname, relrowsecurity from pg_class where relname like 'wai_%' and relkind = 'r'",
		);
		expect(rows.length).toBe(29);
		expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
		const policies = await sql.query("select 1 from pg_policies where tablename like 'wai_%'");
		expect(policies.rows).toHaveLength(0);
	});

	it("records the schema version", async () => {
		const { rows } = await sql.query<{ value: string }>(
			"select value from wai_meta where key = 'schema_version'",
		);
		expect(rows[0].value).toBe(String(SCHEMA_VERSION));
		expect(SCHEMA_VERSION).toBe(6);
	});

	it("accepts only the seven task states", async () => {
		const { rows } = await task();
		await expect(
			sql.query("update wai_tasks set state = 'done' where id = $1", [rows[0].id]),
		).rejects.toThrow();
		for (const state of ["running", "needs_review", "failed", "cancelled", "outcome_unknown", "queued"])
			await sql.query("update wai_tasks set state = $2 where id = $1", [rows[0].id, state]);
	});

	it("refuses the same idempotency key twice", async () => {
		await task({ idempotency_key: "same-request" });
		await expect(task({ idempotency_key: "same-request" })).rejects.toThrow(/unique|duplicate/i);
	});

	it("refuses to complete a task without evidence", async () => {
		const { rows } = await task();
		await expect(
			sql.query("update wai_tasks set state = 'completed', finished_at = now() where id = $1", [rows[0].id]),
		).rejects.toThrow(/wai_tasks_completed_has_evidence/);
		await expect(
			sql.query(
				`update wai_tasks set state = 'completed', completion_evidence = '{"ok":true}'::jsonb where id = $1`,
				[rows[0].id],
			),
		).rejects.toThrow(/wai_tasks_completed_has_evidence/);
		await sql.query(
			`update wai_tasks set state = 'completed', completion_evidence = '{"ok":true}'::jsonb, finished_at = now() where id = $1`,
			[rows[0].id],
		);
	});

	it("only accepts a known kind of requester", async () => {
		await expect(task({ requested_by: "somebody" })).rejects.toThrow(/wai_tasks_requester_is_known/);
		await task({ requested_by: "agent:nexus" });
		await task({ requested_by: "system:schedule" });
	});

	it("limits how deeply tasks can be delegated", async () => {
		const { rows } = await task();
		await expect(
			sql.query(
				`insert into wai_tasks (kind,title,owner_role,idempotency_key,requested_by,expected_result,parent_task_id,delegation_depth)
				 values ('relay.support_draft','x','relay',$1,'agent:nexus','y',$2,4)`,
				[crypto.randomUUID(), rows[0].id],
			),
		).rejects.toThrow();
	});

	it("never lets an agent or the system approve a document version", async () => {
		const doc = await sql.query<{ id: string }>(
			`insert into wai_documents (collection, title, owner, source, created_by) values ('support-policy','Returns','Pat','test','operator:u1') returning id`,
		);
		const insert = (approvedBy: string | null, status: string) =>
			sql.query(
				`insert into wai_document_versions (document_id, version, title, content, content_sha256, status, submitted_by, approved_by, approved_at)
				 values ($1, $2, 'Returns', 'text', 'abc', $3, 'operator:u1', $4, case when $4::text is null then null else now() end)`,
				[doc.rows[0].id, Math.floor(Math.random() * 1e6), status, approvedBy],
			);
		await expect(insert("agent:atlas", "approved")).rejects.toThrow(/wai_versions_approver_is_a_person/);
		await expect(insert("system:schedule", "approved")).rejects.toThrow(/wai_versions_approver_is_a_person/);
		await expect(insert(null, "approved")).rejects.toThrow(/wai_versions_approved_has_approver/);
		await insert("operator:u1", "approved");
		await insert(null, "draft");
	});

	it("never lets an agent review anything", async () => {
		const insert = (reviewer: string) =>
			sql.query(
				`insert into wai_reviews (subject_type, subject_id, decision, reviewer) values ('draft','d1','approved',$1)`,
				[reviewer],
			);
		await expect(insert("agent:relay")).rejects.toThrow(/wai_reviews_reviewer_is_a_person/);
		await insert("operator:u1");
	});

	it("allows one draft per task and refuses a saved draft nobody reviewed", async () => {
		const t = await task();
		const c = await sql.query<{ id: string }>(
			`insert into wai_cases (source, subject, message, message_sha256, created_by) values ('manual','s','m','h','operator:u1') returning id`,
		);
		const draft = (state = "pending_review", reviewedBy: string | null = null) =>
			sql.query(
				`insert into wai_drafts (task_id, case_id, body, body_sha256, source_status, created_by_role, state, reviewed_by, saved_at)
				 values ($1,$2,'body','sha','ok','relay',$3,$4, case when $3 = 'saved' then now() else null end)`,
				[t.rows[0].id, c.rows[0].id, state, reviewedBy],
			);
		await expect(draft("saved", null)).rejects.toThrow(/wai_drafts_saved_was_reviewed/);
		await expect(draft("saved", "agent:relay")).rejects.toThrow(/wai_drafts_reviewer_is_a_person/);
		await draft();
		await expect(draft()).rejects.toThrow(/unique|duplicate/i);
	});

	it("keeps one case per outside reference", async () => {
		const insert = (ref: string | null) =>
			sql.query(
				`insert into wai_cases (source, source_ref, subject, message, message_sha256, created_by)
				 values ('contact_form', $1, 's', 'm', 'h', 'system:contact-form')`,
				[ref],
			);
		await insert("msg-1");
		await expect(insert("msg-1")).rejects.toThrow(/unique|duplicate/i);
		await insert(null);
		await insert(null);
	});

	it("searches approved text with ranking", async () => {
		const doc = await sql.query<{ id: string }>(
			`insert into wai_documents (collection, title, owner, source, created_by) values ('shipping','Shipping times','Pat','test','operator:u1') returning id`,
		);
		await sql.query(
			`insert into wai_document_versions (document_id, version, title, content, content_sha256, submitted_by)
			 values ($1, 1, 'Shipping times', 'Orders ship within two business days from our Winnipeg warehouse.', 'h', 'operator:u1')`,
			[doc.rows[0].id],
		);
		const found = await sql.query(
			`select v.title, ts_rank(v.search, websearch_to_tsquery('english', $1)) as rank
			 from wai_document_versions v where v.search @@ websearch_to_tsquery('english', $1)`,
			["when will my order ship"],
		);
		expect(found.rows.length).toBeGreaterThan(0);
	});
});
