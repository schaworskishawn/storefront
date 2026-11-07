import { audit } from "../audit";
import type { Sql } from "../db/sql";
import type { OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";

/** What the compliance records share: one kind of error, and the same reading of text, dates and the owner's steps. */

export class ComplianceError extends WorkflowError {
	constructor(code: "invalid" | "not_found" | "conflict" | "forbidden", message: string) {
		super(code, message);
		this.name = "ComplianceError";
	}
}

export const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

export const pick = <T extends string>(options: Record<T, string>, value: unknown): T | undefined =>
	(Object.keys(options) as T[]).find((option) => option === value);

/** A stored calendar day as "YYYY-MM-DD". */
export const day = (value: unknown): string | null =>
	value === null || value === undefined
		? null
		: value instanceof Date
			? value.toISOString().slice(0, 10)
			: String(value).slice(0, 10);

/** A calendar day typed in, as "YYYY-MM-DD", or null when the field was left empty. A day that doesn't exist is refused. */
export function optionalDay(label: string, value: unknown): string | null {
	const text = tidy(value, 10);
	if (!text) return null;
	const at = Date.parse(`${text}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
		Number.isNaN(at) ||
		new Date(at).toISOString().slice(0, 10) !== text
	)
		throw new ComplianceError("invalid", `${label} must be a date, like 2026-10-14.`);
	return text;
}

export function requiredDay(label: string, value: unknown): string {
	const parsed = optionalDay(label, value);
	if (!parsed) throw new ComplianceError("invalid", `Enter ${label.toLowerCase()}.`);
	return parsed;
}

export const addDays = (from: string, days: number): string =>
	new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A whole number typed in, or null when it was left empty. */
export function optionalWhole(
	label: string,
	value: unknown,
	range: { min: number; max: number },
): number | null {
	const text = tidy(value, 12);
	if (!text) return null;
	if (!/^\d{1,9}$/.test(text)) throw new ComplianceError("invalid", `${label} must be a whole number.`);
	const amount = Number(text);
	if (amount < range.min || amount > range.max)
		throw new ComplianceError("invalid", `${label} must be from ${range.min} to ${range.max}.`);
	return amount;
}

/** An address a source can be read at. Only https, and nothing that signs in. */
export function sourceAddress(value: unknown): string | null {
	const text = tidy(value, 1000);
	if (!text) return null;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		throw new ComplianceError(
			"invalid",
			"The source's address isn't an address. It should start with https://.",
		);
	}
	if (url.protocol !== "https:" || url.username || url.password)
		throw new ComplianceError("invalid", "The source's address must be a plain https:// address.");
	return url.toString();
}

/** Refuses a step that is the owner's, and says so in the audit log. */
export async function ownerOnly(
	sql: Sql,
	actor: OperatorActor,
	action: string,
	subject: string,
	refusal: string,
): Promise<void> {
	if (actor.role === "owner") return;
	await audit(sql, { actor, action, subject, outcome: "denied", detail: { reason: "owner only" } });
	throw new ComplianceError("forbidden", refusal);
}
