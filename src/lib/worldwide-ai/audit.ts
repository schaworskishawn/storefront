import type { Sql } from "./db/sql";
import { json } from "./db/sql";
import { redactDeep } from "./redact";
import { actorKey, type Actor } from "./types";

/** Who did what, and whether they were allowed. Denied attempts are recorded too: that is most of what an audit is for. */

export type AuditEntry = {
	actor: Actor | null;
	action: string;
	subject?: string | null;
	outcome: "allowed" | "denied";
	detail?: Record<string, unknown>;
};

export async function audit(sql: Sql, entry: AuditEntry): Promise<void> {
	const who = entry.actor ? actorKey(entry.actor) : "anonymous";
	const role =
		entry.actor?.kind === "operator"
			? entry.actor.role
			: entry.actor?.kind === "agent"
				? entry.actor.roleId
				: null;
	try {
		await sql.query(
			`insert into wai_audit_log (actor, actor_role, action, subject, outcome, detail) values ($1,$2,$3,$4,$5,$6::jsonb)`,
			[who, role, entry.action, entry.subject ?? null, entry.outcome, json(redactDeep(entry.detail ?? {}))],
		);
	} catch (error) {
		// If the audit table can't be written, say so loudly; the action itself is decided before this is called.
		console.error(
			"[worldwide-ai] couldn't write an audit entry:",
			error instanceof Error ? error.message : error,
		);
	}
}

export type AuditRow = {
	id: number;
	at: string;
	actor: string;
	actorRole: string | null;
	action: string;
	subject: string | null;
	outcome: "allowed" | "denied";
	detail: Record<string, unknown>;
};

export async function listAudit(sql: Sql, limit = 100): Promise<AuditRow[]> {
	const { rows } = await sql.query(
		`select id, at, actor, actor_role, action, subject, outcome, detail from wai_audit_log order by id desc limit $1`,
		[Math.min(Math.max(limit, 1), 500)],
	);
	return rows.map((r) => ({
		id: Number(r.id),
		at: new Date(r.at as string).toISOString(),
		actor: r.actor as string,
		actorRole: (r.actor_role as string | null) ?? null,
		action: r.action as string,
		subject: (r.subject as string | null) ?? null,
		outcome: r.outcome as "allowed" | "denied",
		detail: (r.detail as Record<string, unknown>) ?? {},
	}));
}
