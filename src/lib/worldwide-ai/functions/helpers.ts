import { z } from "zod";
import { ZERO, dec, toText, tryDec, type Dec } from "../decimal";
import { dataBlock } from "../support/prompts";
import type { Row } from "./table";
import { FunctionBlocked, type FunctionContext } from "./types";

/** Small pieces the function handlers share. */

export const text = z.string();
export const texts = z.array(z.string());
export const count = z.number().int().nonnegative();
export const nullableText = z.string().nullable();

/** A validated number from a row, or zero when the cell is blank. (Types were already checked when the table was read.) */
export const num = (row: Row, key: string): Dec => tryDec(row[key]) ?? ZERO;
/** A number from a row, or null when the cell is blank: for values where "not given" must stay distinct from zero. */
export const numOrNull = (row: Row, key: string): Dec | null => tryDec(row[key]);
export const fixed = (value: Dec, places = 2): string => toText(value, places);
export const plain = (value: Dec): string => toText(value);
export const upper = (value: string | undefined): string => (value ?? "").trim().toUpperCase();
export const lower = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

/** Stops a function because what was supplied can't support the result. Nothing is stored. */
export function block(message: string): never {
	throw new FunctionBlocked(message);
}

/** A number typed into a form field, with a default for when it was left blank. */
export const fieldDec = (ctx: FunctionContext, key: string, fallback: string): Dec =>
	dec(ctx.text(key) || fallback);
export const fieldInt = (ctx: FunctionContext, key: string, fallback: number): number =>
	ctx.text(key) ? Number(ctx.text(key)) : fallback;

/** Supplied text, fenced so the model reads it as information and never as instructions. */
export const fenced = (kind: string, body: string, label = ""): string =>
	dataBlock(label ? { kind, label } : { kind }, body);

/** Supplied rows as a fenced table the model can cite by row id. */
export function fencedRows(
	kind: string,
	rows: readonly Row[],
	idPrefix: string,
): { block: string; ids: string[] } {
	const ids = rows.map((_, index) => `${idPrefix}${index + 1}`);
	const lines = rows.map(
		(row, index) =>
			`[${ids[index]}] ${Object.entries(row)
				.filter(([, value]) => value !== "")
				.map(([key, value]) => `${key}: ${value}`)
				.join(" | ")}`,
	);
	return { block: dataBlock({ kind }, lines.join("\n")), ids };
}

/** The ids in `cited` that weren't among the ones supplied. An empty list means every citation is real. */
export const unknownIds = (cited: readonly string[], supplied: readonly string[]): string[] => {
	const known = new Set(supplied);
	return [...new Set(cited.filter((id) => !known.has(id)))];
};

/** Figures in drafted text that appear nowhere in what was supplied: the usual sign of an invented number. */
export function unsupportedFigures(drafted: string, supplied: string): string[] {
	const figures = drafted.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
	const haystack = supplied.replace(/,/g, "");
	return [
		...new Set(
			figures
				.map((figure) => figure.replace(/,/g, ""))
				.filter(
					(figure) =>
						figure.replace(/[$%]/g, "").length > 1 && !haystack.includes(figure.replace(/[$%]/g, "")),
				),
		),
	].slice(0, 12);
}

/** Flattens any drafted record into the text a reviewer would read, for the figure check above. */
export function flattenText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(flattenText).join("\n");
	if (value && typeof value === "object") return Object.values(value).map(flattenText).join("\n");
	return typeof value === "number" ? String(value) : "";
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
