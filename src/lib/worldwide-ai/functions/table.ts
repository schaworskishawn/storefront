import { tryDec } from "../decimal";

/**
 * Reads the tables people supply to a function: a CSV or tab-separated export pasted into a form, or a JSON array of
 * records. Headers are matched to the columns a function declares (case, spacing and common alternative names don't matter),
 * every declared type is checked, and every problem is reported with its row, so a bad file is refused with a reason
 * instead of being half-read.
 */

export type ColumnKind = "text" | "decimal" | "integer" | "date" | "datetime";

export type TableColumn = {
	key: string;
	label: string;
	required?: boolean;
	kind?: ColumnKind;
	/** Other header names that mean this column ("qty" for quantity). */
	aliases?: readonly string[];
};

export type Row = Record<string, string>;

export type ParsedTable = { rows: Row[]; problems: string[]; format: "csv" | "json" | "records" | "empty" };

/** How a header is matched: case, spaces and punctuation don't count ("Order No." is "orderno"). */
export const normalizeHeader = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalize = normalizeHeader;

/** A real calendar day written as YYYY-MM-DD. */
export function isIsoDay(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** An instant with a date and a time. A bare day isn't one, and neither is text `Date` would guess at. */
export function isIsoInstant(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value) &&
		!Number.isNaN(Date.parse(value.replace(" ", "T")))
	);
}

function detectDelimiter(headerLine: string): string {
	const counts = [",", "\t", ";", "|"].map((d) => ({ d, n: headerLine.split(d).length }));
	return counts.sort((a, b) => b.n - a.n)[0].d;
}

/** Splits delimited text into rows of cells, honouring quotes ("a, b" is one cell; "" inside quotes is a quote). */
export function splitDelimited(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i += 1;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"' && cell.trim() === "") {
			cell = "";
			quoted = true;
		} else if (ch === delimiter) {
			row.push(cell);
			cell = "";
		} else if (ch === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else if (ch !== "\r") cell += ch;
	}
	if (cell !== "" || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((cells) => cells.some((c) => c.trim() !== ""));
}

function toRecords(input: unknown): {
	records: Array<Record<string, unknown>>;
	format: ParsedTable["format"];
	error?: string;
} {
	if (input === undefined || input === null) return { records: [], format: "empty" };
	if (Array.isArray(input)) {
		if (input.some((item) => !item || typeof item !== "object" || Array.isArray(item)))
			return { records: [], format: "records", error: "every record must be an object" };
		return { records: input as Array<Record<string, unknown>>, format: "records" };
	}
	if (typeof input !== "string")
		return { records: [], format: "empty", error: "must be text or a list of records" };
	const text = input.replace(/^﻿/, "").trim();
	if (!text) return { records: [], format: "empty" };
	if (text.startsWith("[")) {
		try {
			const parsed = JSON.parse(text);
			if (!Array.isArray(parsed))
				return { records: [], format: "json", error: "the JSON must be a list of records" };
			const inner = toRecords(parsed);
			return { ...inner, format: "json" };
		} catch {
			return { records: [], format: "json", error: "the JSON couldn't be read" };
		}
	}
	const lines = splitDelimited(text, detectDelimiter(text.split("\n")[0]));
	if (lines.length < 1) return { records: [], format: "csv" };
	const headers = lines[0].map((h) => h.trim());
	const records = lines
		.slice(1)
		.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
	return { records, format: "csv" };
}

const MAX_PROBLEMS = 12;

/** Parses and checks one supplied table against its declared columns. `label` names it in every problem. */
export function parseTable(
	input: unknown,
	columns: readonly TableColumn[],
	options: { label: string; maxRows: number; minRows?: number },
): ParsedTable {
	const { records, format, error } = toRecords(input);
	const problems: string[] = [];
	if (error) return { rows: [], problems: [`${options.label}: ${error}.`], format };
	if (records.length < (options.minRows ?? 0))
		return {
			rows: [],
			problems: [
				records.length === 0
					? `${options.label} is empty. Paste the rows with a header line${columns.length ? `: ${columns.map((c) => c.key).join(", ")}` : ""}.`
					: `${options.label} needs at least ${options.minRows} rows; ${records.length} supplied.`,
			],
			format,
		};
	if (records.length > options.maxRows)
		return {
			rows: [],
			problems: [
				`${options.label} has ${records.length} rows; the most this function takes at once is ${options.maxRows}.`,
			],
			format,
		};
	if (records.length === 0) return { rows: [], problems, format };

	// Match the supplied headers to the declared columns.
	const lookup = new Map<string, string>();
	for (const column of columns)
		for (const name of [column.key, column.label, ...(column.aliases ?? [])])
			lookup.set(normalize(name), column.key);
	const supplied = new Set(
		records.flatMap((record) => Object.keys(record).map((h) => lookup.get(normalize(h)) ?? null)),
	);
	const absent = columns.filter((c) => c.required && !supplied.has(c.key));
	if (absent.length)
		return {
			rows: [],
			problems: [
				`${options.label} is missing ${absent.length === 1 ? "the column" : "the columns"} ${absent.map((c) => `"${c.key}"`).join(", ")}.`,
			],
			format,
		};

	const rows: Row[] = [];
	let hidden = 0;
	const report = (message: string) => {
		if (problems.length < MAX_PROBLEMS) problems.push(message);
		else hidden += 1;
	};
	records.forEach((record, index) => {
		const row: Row = {};
		for (const [header, value] of Object.entries(record)) {
			const key = lookup.get(normalize(header)) ?? normalize(header);
			if (!key) continue;
			row[key] = value === null || value === undefined ? "" : String(value).trim();
		}
		const where = `${options.label}, row ${index + 1}`;
		for (const column of columns) {
			const value = row[column.key] ?? "";
			row[column.key] = value;
			if (value === "") {
				if (column.required) report(`${where}: "${column.key}" is empty.`);
				continue;
			}
			if (column.kind === "decimal" && !tryDec(value))
				report(`${where}: "${column.key}" (${value}) isn't a number.`);
			if (column.kind === "integer" && !/^-?\d+$/.test(value))
				report(`${where}: "${column.key}" (${value}) isn't a whole number.`);
			if (column.kind === "date" && !isIsoDay(value))
				report(`${where}: "${column.key}" (${value}) isn't a date like 2026-10-31.`);
			if (column.kind === "datetime" && !isIsoInstant(value) && !isIsoDay(value))
				report(`${where}: "${column.key}" (${value}) isn't a date and time like 2026-10-31T14:05:00Z.`);
		}
		rows.push(row);
	});
	if (hidden) problems.push(`…and ${hidden} more problem${hidden === 1 ? "" : "s"} in ${options.label}.`);
	return { rows, problems, format };
}

/** Lines of free text as a list: one item per line, blanks dropped, bullets and numbering removed. */
export function parseList(input: unknown, maxItems: number): string[] {
	const items = Array.isArray(input)
		? input.map(String)
		: typeof input === "string"
			? input.split(/\r?\n/)
			: [];
	return items
		.map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
		.filter(Boolean)
		.slice(0, maxItems);
}

/** Groups rows by a key, keeping first-seen order. */
export function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const group = groups.get(key);
		if (group) group.push(item);
		else groups.set(key, [item]);
	}
	return groups;
}
