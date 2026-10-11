import { z } from "zod";
import type { IntegrationId } from "../integrations/catalog";
import { TASK_KINDS, TASK_STATES } from "../types";

/**
 * Every tool an agent role can be given. The catalog says what a tool is and what it accepts; whether a role may call it is
 * in the registry; whether it works yet is whether a handler is wired for it (the gateway reports the rest as unavailable).
 *
 * There are deliberately no tools that spend money, submit anything to a tax authority or bank, message a customer, or
 * change production: those stay outside Phase 1's automatic workflows, so there is nothing for a prompt to talk its way into.
 */

export const TOOL_IDS = [
	"atlas.search",
	"atlas.get_document",
	"case.get",
	"case.list",
	"draft.save",
	"task.create",
	"task.get",
	"task.list",
	"finding.record",
	"health.read",
	"openclaw.inspect",
	"openclaw.get_run",
	// The shared function pipeline: read what a person supplied for this task, and store the result for review.
	"source.read_supplied",
	"product.store",
	"product.read",
	// No Phase 1 connector: a role may be allowed these, and they answer "not configured" until a connector exists.
	"saleor.order.read",
	"saleor.permissions.read",
	"carrier.events.read",
	"carrier.invoices.read",
	"accounting.records.read",
	"accounting.entries.draft",
	"bank.transactions.read",
	"processor.settlements.read",
	"logs.read",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export const isToolId = (value: unknown): value is ToolId =>
	typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);

/** "read" only reads; "write_internal" writes our own tables (never an outside system); "job" starts a bounded background job. */
export type ToolEffect = "read" | "write_internal" | "job";

export type ToolDefinition = {
	id: ToolId;
	summary: string;
	effect: ToolEffect;
	/** The outside system it needs, or "internal" for our own database. */
	integration: IntegrationId | "internal";
	inputSchema: z.ZodType;
};

const uuid = z.string().uuid();
const emptyObject = z.object({}).strict();
const loose = z.record(z.string(), z.unknown());

export const TOOLS: Record<ToolId, ToolDefinition> = {
	"atlas.search": {
		id: "atlas.search",
		summary:
			"Search approved knowledge documents (policies, procedures, rules) and get their versions and freshness.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({
			query: z.string().min(1).max(2000),
			collection: z.string().min(1).max(60).optional(),
			limit: z.number().int().min(1).max(5).optional(),
		}),
	},
	"atlas.get_document": {
		id: "atlas.get_document",
		summary: "Read one approved document version in full.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ documentId: uuid, version: z.number().int().min(1).optional() }),
	},
	"case.get": {
		id: "case.get",
		summary: "Read one support case: the customer's message, subject and any order number.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ caseId: uuid }),
	},
	"case.list": {
		id: "case.list",
		summary: "List support cases, newest first.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({
			status: z.enum(["open", "draft_ready", "resolved", "closed"]).optional(),
			limit: z.number().int().min(1).max(50).optional(),
		}),
	},
	"draft.save": {
		id: "draft.save",
		summary: "Save a reply draft and its sources against a case. Nothing is sent to the customer.",
		effect: "write_internal",
		integration: "internal",
		inputSchema: z.object({
			caseId: uuid,
			taskId: uuid,
			subject: z.string().max(300).optional(),
			body: z.string().min(1).max(8000),
			citations: z.array(uuid).max(10),
		}),
	},
	"task.create": {
		id: "task.create",
		summary: "Create a task owned by one role (limited by delegation depth).",
		effect: "write_internal",
		integration: "internal",
		inputSchema: z.object({
			kind: z.enum(TASK_KINDS),
			title: z.string().min(1).max(200),
			input: loose.optional(),
			parentTaskId: uuid.optional(),
		}),
	},
	"task.get": {
		id: "task.get",
		summary: "Read one task with its state, evidence and history.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ taskId: uuid }),
	},
	"task.list": {
		id: "task.list",
		summary: "List tasks, optionally by state or owning role.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({
			state: z.enum(TASK_STATES).optional(),
			limit: z.number().int().min(1).max(50).optional(),
		}),
	},
	"finding.record": {
		id: "finding.record",
		summary: "Record a finding with its evidence and source references.",
		effect: "write_internal",
		integration: "internal",
		inputSchema: z.object({
			title: z.string().min(1).max(200),
			detail: z.string().max(4000),
			severity: z.enum(["info", "low", "medium", "high", "critical"]),
			category: z.string().min(1).max(60),
			taskId: uuid.optional(),
			evidence: loose.optional(),
		}),
	},
	"health.read": {
		id: "health.read",
		summary: "Read the latest integration health results.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ integration: z.string().max(40).optional() }),
	},
	"openclaw.inspect": {
		id: "openclaw.inspect",
		summary: "Start a bounded website inspection of allowed pages at desktop and mobile widths.",
		effect: "job",
		integration: "openclaw",
		inputSchema: z.object({ urls: z.array(z.string().url()).min(1).max(5) }),
	},
	"openclaw.get_run": {
		id: "openclaw.get_run",
		summary: "Check an existing OpenClaw run by its run id.",
		effect: "read",
		integration: "openclaw",
		inputSchema: z.object({ runId: z.string().min(1).max(120) }),
	},
	"source.read_supplied": {
		id: "source.read_supplied",
		summary:
			"Read the records a person supplied for this task (a pasted table, a document, an upload). Nothing else.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ taskId: uuid }),
	},
	"product.store": {
		id: "product.store",
		summary: "Store this task's result privately for a person to review. Nothing leaves the workspace.",
		effect: "write_internal",
		integration: "internal",
		inputSchema: z.object({ taskId: uuid }),
	},
	"product.read": {
		id: "product.read",
		summary: "Read a stored result and its evidence, for checking or consolidating.",
		effect: "read",
		integration: "internal",
		inputSchema: z.object({ productId: uuid }),
	},
	"saleor.order.read": {
		id: "saleor.order.read",
		summary: "Read an order's status from Saleor, for a customer who is authorized to ask about it.",
		effect: "read",
		integration: "saleor",
		inputSchema: z.object({ orderNumber: z.string().min(1).max(40) }),
	},
	"saleor.permissions.read": {
		id: "saleor.permissions.read",
		summary: "Read staff accounts and their permission groups from Saleor.",
		effect: "read",
		integration: "saleor",
		inputSchema: emptyObject,
	},
	"carrier.events.read": {
		id: "carrier.events.read",
		summary: "Read shipment tracking events from the carrier.",
		effect: "read",
		integration: "carrier",
		inputSchema: z.object({ trackingNumber: z.string().min(1).max(60) }),
	},
	"carrier.invoices.read": {
		id: "carrier.invoices.read",
		summary: "Read carrier invoices and their line items.",
		effect: "read",
		integration: "carrier",
		inputSchema: z.object({ period: z.string().max(20) }),
	},
	"accounting.records.read": {
		id: "accounting.records.read",
		summary: "Read transactions and balances from the accounting system.",
		effect: "read",
		integration: "accounting",
		inputSchema: z.object({ period: z.string().max(20) }),
	},
	"accounting.entries.draft": {
		id: "accounting.entries.draft",
		summary: "Prepare a draft journal entry for a person to review. Never posts.",
		effect: "write_internal",
		integration: "accounting",
		inputSchema: loose,
	},
	"bank.transactions.read": {
		id: "bank.transactions.read",
		summary: "Read authorized bank transactions.",
		effect: "read",
		integration: "bank",
		inputSchema: z.object({ period: z.string().max(20) }),
	},
	"processor.settlements.read": {
		id: "processor.settlements.read",
		summary: "Read payment processor settlements.",
		effect: "read",
		integration: "processor",
		inputSchema: z.object({ period: z.string().max(20) }),
	},
	"logs.read": {
		id: "logs.read",
		summary: "Read application error logs from the hosting platform.",
		effect: "read",
		integration: "logs",
		inputSchema: z.object({ since: z.string().max(40).optional() }),
	},
};
