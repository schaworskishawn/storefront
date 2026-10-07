import { audit } from "../audit";
import { iso, json, type Sql } from "../db/sql";
import { actorKey, isRoleId, type OperatorActor, type RoleId } from "../types";
import { parseLimitOverrides, resolveLimits, type ExecutionLimits } from "./limits";
import { ROLES, ROLE_BY_ID } from "./registry";

/** The owner's settings for each role: switch it off, or tighten or loosen its limits (never past the hard caps). */

export type RoleSettings = {
	roleId: RoleId;
	enabled: boolean;
	overrides: Partial<ExecutionLimits>;
	limits: ExecutionLimits;
	updatedBy: string | null;
	updatedAt: string | null;
};

export async function loadSettings(sql: Sql): Promise<Record<RoleId, RoleSettings>> {
	const { rows } = await sql.query(
		`select role_id, enabled, limits, updated_by, updated_at from wai_agent_settings`,
	);
	const saved = new Map(rows.map((r) => [r.role_id as string, r]));
	return Object.fromEntries(
		ROLES.map((role) => {
			const row = saved.get(role.id);
			const overrides = (row?.limits as Partial<ExecutionLimits> | undefined) ?? {};
			return [
				role.id,
				{
					roleId: role.id,
					enabled: row ? Boolean(row.enabled) : true,
					overrides,
					limits: resolveLimits(role.limits, overrides),
					updatedBy: (row?.updated_by as string | null) ?? null,
					updatedAt: row ? iso(row.updated_at) : null,
				},
			];
		}),
	) as Record<RoleId, RoleSettings>;
}

export async function loadRoleSettings(sql: Sql, roleId: RoleId): Promise<RoleSettings> {
	return (await loadSettings(sql))[roleId];
}

export class SettingsError extends Error {
	constructor(
		readonly code: "forbidden" | "invalid",
		message: string,
	) {
		super(message);
		this.name = "SettingsError";
	}
}

/** Owner only. A role's own tools and knowledge are not editable here: those are code, reviewed like code. */
export async function updateRoleSettings(
	sql: Sql,
	actor: OperatorActor,
	roleId: string,
	change: { enabled?: boolean; limits?: unknown },
): Promise<RoleSettings> {
	if (actor.role !== "owner") {
		await audit(sql, { actor, action: "agents.update_settings", subject: roleId, outcome: "denied" });
		throw new SettingsError("forbidden", "Only the owner can change a role's settings.");
	}
	if (!isRoleId(roleId)) throw new SettingsError("invalid", "That role doesn't exist.");
	const current = await loadRoleSettings(sql, roleId);
	let overrides = current.overrides;
	if (change.limits !== undefined) {
		const parsed = parseLimitOverrides(change.limits);
		if (!parsed.ok) throw new SettingsError("invalid", parsed.message);
		overrides = parsed.value;
	}
	const enabled = change.enabled ?? current.enabled;
	await sql.query(
		`insert into wai_agent_settings (role_id, enabled, limits, updated_by, updated_at) values ($1,$2,$3::jsonb,$4, now())
		 on conflict (role_id) do update set enabled = excluded.enabled, limits = excluded.limits, updated_by = excluded.updated_by, updated_at = now()`,
		[roleId, enabled, json(overrides), actorKey(actor)],
	);
	await audit(sql, {
		actor,
		action: "agents.update_settings",
		subject: roleId,
		outcome: "allowed",
		detail: { enabled, limits: overrides },
	});
	return loadRoleSettings(sql, roleId);
}

export const defaultLimitsFor = (roleId: RoleId): ExecutionLimits => ROLE_BY_ID[roleId].limits;
