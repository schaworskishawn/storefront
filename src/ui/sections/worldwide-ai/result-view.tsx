import type { ReactNode } from "react";
import { Bullets, DataTable, KeyValues } from "./ui";

/**
 * Shows a stored result of any type as headed sections: single values as a list of facts, lists of records as tables, lists
 * of text as bullets. It renders what is stored, in the order it was stored, and adds nothing of its own.
 */

/** "landedPerUnit" → "Landed per unit". */
export function humanize(key: string): string {
	const spaced = key
		.replace(/[_-]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/\bml\b/gi, "mL")
		.trim();
	const lower = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
	return lower
		.replace(/\bml\b/g, "mL")
		.replace(/\bsku\b/gi, "SKU")
		.replace(/\bid\b/gi, "ID")
		.replace(/\bseo\b/gi, "SEO");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isScalar = (value: unknown): value is string | number | boolean | null =>
	value === null || ["string", "number", "boolean"].includes(typeof value);

function cell(value: unknown): ReactNode {
	if (value === null || value === undefined || value === "") return <span className="wai-muted">—</span>;
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return value.length > 400 ? `${value.slice(0, 400)}…` : value;
	if (Array.isArray(value)) {
		if (value.length === 0) return <span className="wai-muted">—</span>;
		return value.every(isScalar)
			? value
					.map((item) => (typeof item === "boolean" ? (item ? "Yes" : "No") : String(item ?? "—")))
					.join(", ")
			: value.map((item) => summary(item)).join("; ");
	}
	return summary(value);
}

function summary(value: unknown): string {
	if (isScalar(value)) return value === null ? "—" : String(value);
	if (Array.isArray(value)) return value.map(summary).join(", ");
	return Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
		.map(([k, v]) => `${humanize(k).toLowerCase()}: ${summary(v)}`)
		.join(", ");
}

const isNumeric = (value: unknown) =>
	typeof value === "number" || (typeof value === "string" && /^-?\d[\d,]*(\.\d+)?%?$/.test(value));

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div>
			<h3 className="wai-h3">{title}</h3>
			{children}
		</div>
	);
}

function Block({ name, value }: { name: string; value: unknown }): ReactNode {
	const title = humanize(name);
	if (Array.isArray(value)) {
		if (value.length === 0)
			return (
				<Section title={title}>
					<p className="wai-muted wai-small" style={{ margin: 0 }}>
						None.
					</p>
				</Section>
			);
		if (value.every(isScalar))
			return (
				<Section title={title}>
					<Bullets items={value.map((item) => String(item ?? "—"))} />
				</Section>
			);
		if (value.every(isRecord)) {
			const columns = [...new Set(value.flatMap((row) => Object.keys(row)))];
			const numeric = columns
				.map((column, index) =>
					value.every((row) => row[column] === null || row[column] === undefined || isNumeric(row[column]))
						? index
						: -1,
				)
				.filter((i) => i >= 0);
			return (
				<Section title={title}>
					<DataTable
						caption={`${title}: ${value.length} ${value.length === 1 ? "row" : "rows"}`}
						columns={columns.map(humanize)}
						rows={value.map((row) => columns.map((column) => cell(row[column])))}
						numeric={numeric}
					/>
				</Section>
			);
		}
	}
	if (isRecord(value)) {
		const entries = Object.entries(value);
		const simple = entries.filter(
			([, v]) => isScalar(v) || (Array.isArray(v) && v.every(isScalar) && v.length <= 6),
		);
		const complex = entries.filter(([k]) => !simple.some(([s]) => s === k));
		return (
			<Section title={title}>
				<div className="wai-stack" style={{ gap: 12 }}>
					{simple.length > 0 && <KeyValues items={simple.map(([k, v]) => [humanize(k), cell(v)])} />}
					{complex.map(([k, v]) => (
						<Block key={k} name={k} value={v} />
					))}
				</div>
			</Section>
		);
	}
	return null;
}

export function ResultView({ payload }: { payload: unknown }) {
	if (!isRecord(payload)) return <pre className="wai-pre">{summary(payload)}</pre>;
	const entries = Object.entries(payload);
	const facts = entries.filter(
		([, value]) => isScalar(value) && !(typeof value === "string" && value.length > 160),
	);
	const prose = entries.filter(([, value]) => typeof value === "string" && value.length > 160);
	const blocks = entries.filter(([, value]) => !isScalar(value));
	return (
		<div className="wai-stack" style={{ gap: 20 }}>
			{facts.length > 0 && <KeyValues items={facts.map(([key, value]) => [humanize(key), cell(value)])} />}
			{prose.map(([key, value]) => (
				<Section key={key} title={humanize(key)}>
					<pre className="wai-pre">{String(value)}</pre>
				</Section>
			))}
			{blocks.map(([key, value]) => (
				<Block key={key} name={key} value={value} />
			))}
		</div>
	);
}
