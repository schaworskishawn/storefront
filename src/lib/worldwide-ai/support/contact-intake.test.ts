import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readConfig } from "../config";
import type { SqlClient } from "../db/sql";
import { countTasksByState } from "../tasks/repo";
import { freshDb } from "../testing.test-util";
import { listCases } from "./cases";
import { fileContactMessage, type ContactMessage } from "./contact-intake";

vi.setConfig({ testTimeout: 60_000 });

let sql: SqlClient;
beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

const on = { POSTGRES_URL: "postgres://test", WORLDWIDE_AI_INGEST_CONTACT_FORM: "true" };
const deps = (env: Record<string, string>) => ({ config: readConfig(env), sql: async () => sql });
const contact = (changes: Partial<ContactMessage> = {}): ContactMessage => ({
	firstName: "Jordan",
	lastName: "Example",
	email: "Jordan@Example.com",
	order: "#WV-10231",
	subject: "Order",
	message: "My order arrived with a cracked tank. What should I do?",
	...changes,
});

describe("filing a contact-form message as a support case", () => {
	it("does nothing unless the owner switched it on, and never uses the demonstration store", async () => {
		expect(await fileContactMessage(deps({ POSTGRES_URL: "postgres://test" }), contact())).toEqual({
			filed: false,
			reason: "switched_off",
		});
		expect(await fileContactMessage(deps({ WORLDWIDE_AI_INGEST_CONTACT_FORM: "true" }), contact())).toEqual({
			filed: false,
			reason: "no_database",
		});
		expect(
			await fileContactMessage(
				deps({ WORLDWIDE_AI_INGEST_CONTACT_FORM: "true", WORLDWIDE_AI_STORE: "demo" }),
				contact(),
			),
		).toEqual({ filed: false, reason: "no_database" });
		expect(await listCases(sql)).toHaveLength(0);
	});

	it("files the message once, however many times it arrives, and starts no work", async () => {
		const first = await fileContactMessage(deps(on), contact());
		const again = await fileContactMessage(deps(on), contact({ email: "jordan@example.com" }));
		expect(first).toMatchObject({ filed: true, created: true });
		expect(again).toMatchObject({ filed: true, created: false });
		expect(first.filed && again.filed && first.caseId === again.caseId).toBe(true);

		const cases = await listCases(sql);
		expect(cases).toHaveLength(1);
		expect(cases[0]).toMatchObject({
			source: "contact_form",
			subject: "Order",
			customerName: "Jordan Example",
			customerEmail: "Jordan@Example.com",
			orderNumber: "WV-10231",
			status: "open",
			draftCount: 0,
		});
		expect(Object.values(await countTasksByState(sql)).reduce((a, b) => a + b, 0)).toBe(0);
	});

	it("leaves out an order number a case wouldn't accept instead of losing the message", async () => {
		const result = await fileContactMessage(
			deps(on),
			contact({
				order: "the one from last week!",
				message: "Where is my other order? It has been ten days.",
			}),
		);
		expect(result).toMatchObject({ filed: true, created: true });
		const filed = (await listCases(sql)).find((c) => c.message.startsWith("Where is my other order"));
		expect(filed?.orderNumber).toBeNull();
	});

	it("never throws: a database failure is reported, not raised", async () => {
		const broken = {
			config: readConfig(on),
			sql: async (): Promise<SqlClient> => {
				throw new Error("connection refused");
			},
		};
		expect(await fileContactMessage(broken, contact())).toEqual({ filed: false, reason: "failed" });
	});
});
