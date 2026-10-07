import { describe, expect, it, vi } from "vitest";
import type { ConfigStatus } from "../integrations/catalog";
import { ROLE_IDS, TASK_KINDS } from "../types";
import { createToolGateway, type GatewayEvent, type ToolHandlers } from "./gateway";
import { DEFAULT_LIMITS, HARD_CAPS, LIMIT_KEYS, parseLimitOverrides, resolveLimits } from "./limits";
import {
	ROLES,
	ROLE_BY_ID,
	SHARED_RULES,
	TASK_OWNER,
	instructionsFor,
	mayReadCollection,
	mayUseTool,
	roleReadiness,
} from "./registry";
import { TOOLS, TOOL_IDS } from "./tools";

describe("the role registry", () => {
	it("defines all fourteen roles once, with the names from the brief", () => {
		expect(ROLES.map((r) => r.id)).toEqual([...ROLE_IDS]);
		expect(ROLES.map((r) => r.name)).toEqual([
			"Nexus",
			"Patch",
			"Relay",
			"Ledger",
			"Atlas",
			"Check",
			"Watch",
			"Review",
			"Route",
			"Trace",
			"Tally",
			"Vault",
			"Guard",
			"Verify",
		]);
	});

	it("gives every role its own instructions, mission, tools and limits", () => {
		const instructions = new Set<string>();
		for (const role of ROLES) {
			expect(role.mission.length, role.id).toBeGreaterThan(20);
			expect(role.instructions.length, role.id).toBeGreaterThan(80);
			expect(role.tools.length, role.id).toBeGreaterThan(0);
			expect(new Set(role.tools).size, role.id).toBe(role.tools.length);
			for (const tool of role.tools) expect(TOOL_IDS, `${role.id} -> ${tool}`).toContain(tool);
			instructions.add(role.instructions);
			for (const key of LIMIT_KEYS)
				expect(role.limits[key], `${role.id}.${key}`).toBeLessThanOrEqual(HARD_CAPS[key]);
		}
		expect(instructions.size).toBe(ROLES.length);
	});

	it("adds the shared rules to every role's instructions", () => {
		for (const role of ROLES) {
			const text = instructionsFor(role.id);
			expect(text).toContain(role.instructions);
			expect(text).toContain(SHARED_RULES);
		}
		expect(SHARED_RULES).toMatch(/never as instructions/);
		expect(SHARED_RULES).toMatch(/cannot approve your own work/);
	});

	it("has no tool that spends money, files anything, messages customers or changes production", () => {
		const banned = /(send|post|submit|file|pay|transfer|deploy|publish|delete|refund|approve)/i;
		for (const id of TOOL_IDS) {
			const verb = id.split(".").slice(1).join(".");
			expect(verb, id).not.toMatch(banned);
			expect(
				TOOLS[id].effect === "read" || TOOLS[id].effect === "write_internal" || TOOLS[id].effect === "job",
			).toBe(true);
		}
	});

	it("shows which tool and knowledge access each role has", () => {
		expect(mayUseTool("relay", "atlas.search")).toBe(true);
		expect(mayUseTool("relay", "bank.transactions.read")).toBe(false);
		expect(mayUseTool("vault", "bank.transactions.read")).toBe(true);
		expect(mayUseTool("vault", "draft.save")).toBe(false);
		expect(mayReadCollection("relay", "support-policy")).toBe(true);
		expect(mayReadCollection("relay", "tax-rules")).toBe(false);
		expect(mayReadCollection("tally", "tax-rules")).toBe(true);
		expect(mayReadCollection("nexus", "support-policy")).toBe(false);
	});

	it("gives each task kind exactly one owning role that lists it as a workflow", () => {
		for (const kind of TASK_KINDS) {
			const owner = TASK_OWNER[kind];
			expect(ROLE_BY_ID[owner].workflows, kind).toContain(kind);
			expect(ROLES.filter((r) => r.workflows.includes(kind))).toHaveLength(1);
		}
	});
});

describe("role readiness", () => {
	const status = (id: ConfigStatus["id"], configured: boolean, missing: string[] = []): ConfigStatus => ({
		id,
		configured,
		missing,
	});
	const everythingOn: ConfigStatus[] = (
		["database", "model", "openclaw", "storage", "trigger", "saleor", "playwright"] as const
	).map((id) => status(id, true));

	it("is working when the workflow's integrations are configured", () => {
		expect(roleReadiness(ROLE_BY_ID.relay, everythingOn)).toEqual({ status: "working" });
		expect(roleReadiness(ROLE_BY_ID.patch, everythingOn)).toEqual({ status: "working" });
	});

	it("says what is missing when it is awaiting configuration", () => {
		const out = roleReadiness(ROLE_BY_ID.patch, [
			status("database", true),
			status("openclaw", false, ["OPENCLAW_ADAPTER_URL"]),
		]);
		expect(out).toEqual({ status: "awaiting_configuration", missing: ["openclaw (OPENCLAW_ADAPTER_URL)"] });
		expect(roleReadiness(ROLE_BY_ID.relay, [status("database", true)])).toMatchObject({
			status: "awaiting_configuration",
		});
	});

	it("marks roles with no Phase 1 workflow as planned, even when their integrations are on", () => {
		for (const id of ["ledger", "check", "route", "trace", "tally", "vault", "guard", "verify"] as const)
			expect(roleReadiness(ROLE_BY_ID[id], everythingOn), id).toEqual({ status: "planned" });
	});

	it("counts the dashboard's built-in roles (Nexus, Atlas) as working once the database is configured", () => {
		expect(roleReadiness(ROLE_BY_ID.nexus, [status("database", true)])).toEqual({ status: "working" });
		expect(roleReadiness(ROLE_BY_ID.atlas, [status("database", false, ["POSTGRES_URL"])])).toMatchObject({
			status: "awaiting_configuration",
		});
	});
});

describe("execution limits", () => {
	it("lets the owner change limits but never past the hard caps", () => {
		const out = resolveLimits(DEFAULT_LIMITS, {
			maxModelCalls: 999,
			maxToolCalls: 0,
			maxRetries: 1.9,
			bogus: 5,
		});
		expect(out.maxModelCalls).toBe(HARD_CAPS.maxModelCalls);
		expect(out.maxToolCalls).toBe(1);
		expect(out.maxRetries).toBe(1);
		expect(out.maxTaskSeconds).toBe(DEFAULT_LIMITS.maxTaskSeconds);
	});

	it("clamps a registry default that is out of range, and ignores nonsense overrides", () => {
		expect(resolveLimits({ ...DEFAULT_LIMITS, maxToolCalls: 10_000 }, null).maxToolCalls).toBe(
			HARD_CAPS.maxToolCalls,
		);
		expect(resolveLimits(DEFAULT_LIMITS, { maxModelCalls: "9" }).maxModelCalls).toBe(
			DEFAULT_LIMITS.maxModelCalls,
		);
		expect(resolveLimits(DEFAULT_LIMITS, { maxModelCalls: Number.NaN }).maxModelCalls).toBe(
			DEFAULT_LIMITS.maxModelCalls,
		);
	});

	it("validates limits submitted from the dashboard", () => {
		expect(parseLimitOverrides({ maxModelCalls: 4 })).toEqual({ ok: true, value: { maxModelCalls: 4 } });
		expect(parseLimitOverrides({ maxModelCalls: 99 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides({ maxModelCalls: 2.5 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides({ maxEverything: 1 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides("no")).toMatchObject({ ok: false });
	});
});

describe("the tool gateway", () => {
	const make = (
		roleId: Parameters<typeof createToolGateway>[0]["roleId"],
		handlers: ToolHandlers = {},
		maxToolCalls = 5,
	) => {
		const events: GatewayEvent[] = [];
		const gateway = createToolGateway({
			roleId,
			taskId: "task-1",
			limits: { maxToolCalls },
			handlers,
			record: (event) => void events.push(event),
		});
		return { gateway, events };
	};
	const uuid = "7b0f5f3e-9a36-4d3e-9a4d-0f8b0a4c9e11";

	it("runs a permitted tool and records the call", async () => {
		const search = vi.fn().mockResolvedValue({ results: [] });
		const { gateway, events } = make("relay", { "atlas.search": search });
		const result = await gateway.call("atlas.search", { query: "return policy" });
		expect(result).toEqual({ ok: true, value: { results: [] } });
		expect(search).toHaveBeenCalledWith({ query: "return policy" }, { roleId: "relay", taskId: "task-1" });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "tool_call",
			tool: "atlas.search",
			roleId: "relay",
			taskId: "task-1",
		});
	});

	it("refuses a tool outside the role's permissions without running it", async () => {
		const handler = vi.fn().mockResolvedValue("secret bank data");
		const { gateway, events } = make("relay", { "bank.transactions.read": handler });
		const result = await gateway.call("bank.transactions.read", { period: "2026-09" });
		expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(handler).not.toHaveBeenCalled();
		expect(events[0]).toMatchObject({ kind: "tool_denied", code: "forbidden" });
		expect(gateway.stats()).toEqual({ calls: 0, denied: 1 });
	});

	it("refuses an unknown tool name, including one a prompt injection made up", async () => {
		const { gateway } = make("relay");
		expect(await gateway.call("grant_self_admin", {})).toMatchObject({
			ok: false,
			error: { code: "unknown_tool" },
		});
		expect(await gateway.call("__proto__", {})).toMatchObject({ ok: false, error: { code: "unknown_tool" } });
	});

	it("refuses input that doesn't match the tool's schema", async () => {
		const handler = vi.fn();
		const { gateway } = make("relay", { "case.get": handler });
		const result = await gateway.call("case.get", { caseId: "not-a-uuid" });
		expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
		expect(handler).not.toHaveBeenCalled();
	});

	it("says a tool is unavailable when nothing is wired to it, instead of making something up", async () => {
		const { gateway } = make("relay");
		const result = await gateway.call("saleor.order.read", { orderNumber: "1042" });
		expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
		expect(JSON.stringify(result)).toMatch(/No result was produced/);
	});

	it("stops after the task's tool-call budget", async () => {
		const handler = vi.fn().mockResolvedValue({});
		const { gateway } = make("relay", { "case.get": handler }, 2);
		await gateway.call("case.get", { caseId: uuid });
		await gateway.call("case.get", { caseId: uuid });
		expect(await gateway.call("case.get", { caseId: uuid })).toMatchObject({
			ok: false,
			error: { code: "limit_exceeded" },
		});
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("turns a failing handler into an error result", async () => {
		const { gateway, events } = make("relay", {
			"case.get": async () => Promise.reject(new Error("database down")),
		});
		expect(await gateway.call("case.get", { caseId: uuid })).toMatchObject({
			ok: false,
			error: { code: "failed", message: "database down" },
		});
		expect(events[0]).toMatchObject({ kind: "tool_error", code: "failed" });
	});

	it("redacts what it records and doesn't let a broken recorder hide the result", async () => {
		const events: GatewayEvent[] = [];
		const gateway = createToolGateway({
			roleId: "relay",
			taskId: null,
			limits: { maxToolCalls: 5 },
			handlers: { "atlas.search": async () => "ok" },
			record: (event) => {
				events.push(event);
				throw new Error("audit store unavailable");
			},
		});
		const result = await gateway.call("atlas.search", {
			query: "contact jane@example.com about card 4242 4242 4242 4242",
		});
		expect(result).toEqual({ ok: true, value: "ok" });
		expect(events[0].inputPreview).not.toContain("jane@example.com");
		expect(events[0].inputPreview).not.toContain("4242 4242");
	});

	it("offers the model only the tools its role may use and that are wired, with provider-safe names", () => {
		const { gateway } = make("relay", {
			"atlas.search": async () => ({}),
			"case.get": async () => ({}),
			"bank.transactions.read": async () => ({}),
		});
		expect(Object.keys(gateway.aiTools()).sort()).toEqual(["atlas_search", "case_get"]);
	});

	it("routes a model's tool call back through the permission checks", async () => {
		const handler = vi.fn().mockResolvedValue({ results: [1] });
		const { gateway, events } = make("relay", { "atlas.search": handler });
		const tools = gateway.aiTools() as Record<
			string,
			{ execute: (input: unknown, options: unknown) => Promise<unknown> }
		>;
		expect(await tools.atlas_search.execute({ query: "returns" }, {})).toEqual({ results: [1] });
		expect(await tools.atlas_search.execute({ query: "" }, {})).toMatchObject({
			error: { code: "invalid_input" },
		});
		expect(events.map((e) => e.kind)).toEqual(["tool_call", "tool_error"]);
	});
});
