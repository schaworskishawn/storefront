"use client";

import type { FieldSpec } from "@/lib/worldwide-ai/functions/types";
import { runFunctionAction } from "@/lib/worldwide-ai/web/actions";
import { ButtonForm, FieldsForm, type FormField } from "./forms";

/**
 * The input form for one agent function, generated from the fields that function declares. Tables are pasted as text with a
 * header line (CSV, tab-separated or JSON); the server checks every column and row and says exactly what is wrong.
 */

function toFormField(field: FieldSpec): FormField {
	const base = { name: field.key, label: field.label, required: field.required };
	switch (field.kind) {
		case "table": {
			const columns = field.columns.map((column) => `${column.key}${column.required ? "*" : ""}`).join(", ");
			return {
				...base,
				kind: "table",
				help: `${field.help ? `${field.help} ` : ""}Paste rows with a header line (CSV, tab-separated or JSON), up to ${field.maxRows ?? 500} rows.${
					columns ? ` Columns: ${columns} (* required).` : " Any columns."
				}`,
				placeholder: field.columns.length
					? field.columns.map((column) => column.key).join(",")
					: "id,name,quantity",
			};
		}
		case "list":
			return {
				...base,
				kind: "list",
				help: `${field.help ? `${field.help} ` : ""}One per line.`,
				placeholder: field.placeholder,
			};
		case "images":
			return {
				...base,
				kind: "files",
				max: field.maxFiles ?? 4,
				help: `${field.help ? `${field.help} ` : ""}PNG, JPEG or WebP, up to ${field.maxFiles ?? 4} files of 2 MB each.`,
			};
		case "select":
			return { ...base, kind: "select", help: field.help, options: field.options };
		case "textarea":
			return { ...base, kind: "textarea", help: field.help, placeholder: field.placeholder };
		case "date":
			return { ...base, kind: "date", help: field.help };
		case "integer":
			return { ...base, kind: "number", help: field.help };
		case "decimal":
			return { ...base, kind: "decimal", help: field.help };
		default:
			return {
				...base,
				kind: "text",
				help: field.help,
				placeholder: field.placeholder,
				maxLength: field.max,
			};
	}
}

export function FunctionForm({
	functionId,
	action,
	fields,
	hasSample,
	plan,
	initial,
}: {
	functionId: string;
	/** The button's label: "Reconcile settlements". */
	action: string;
	fields: readonly FieldSpec[];
	hasSample: boolean;
	/** A Nexus plan this run belongs to, when it was opened from one. */
	plan?: string;
	initial?: Record<string, string>;
}) {
	const hidden: Record<string, string> = { functionId, ...(plan ? { plan } : {}) };
	return (
		<div className="wai-stack">
			<FieldsForm
				action={runFunctionAction}
				fields={fields.map(toFormField)}
				hidden={hidden}
				submit={action}
				idPrefix={`fn-${functionId}`}
				initial={initial}
			/>
			{hasSample && (
				<div>
					<p className="wai-help" style={{ marginBottom: 6 }}>
						Or see what it produces on fictional data. A sample run is labelled [DEMO], kept out of live lists
						and counts, and is no evidence that anything is connected.
					</p>
					<ButtonForm
						action={runFunctionAction}
						hidden={{ functionId, demo: "1" }}
						label="Run the labelled sample"
						tone="quiet"
						idPrefix={`sample-${functionId}`}
					/>
				</div>
			)}
		</div>
	);
}
