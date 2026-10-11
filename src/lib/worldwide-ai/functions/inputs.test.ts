import { describe, expect, it } from "vitest";
import {
	DecimalError,
	add,
	cmp,
	dec,
	div,
	mul,
	percentOf,
	round,
	sub,
	sum,
	toNumber,
	toText,
	tryDec,
} from "../decimal";
import { isIsoDay, isIsoInstant, parseList, parseTable, splitDelimited } from "./table";
import { parseInput, type FieldSpec } from "./types";

describe("exact decimals", () => {
	it("adds and subtracts without binary rounding", () => {
		expect(toText(add(dec("0.1"), dec("0.2")))).toBe("0.3");
		expect(toText(sub(dec("1"), dec("0.9")))).toBe("0.1");
		expect(toText(sum([dec("19.99"), dec("0.01"), dec("-5")]))).toBe("15");
		expect(toText(dec(0.1 + 0.2), 2)).toBe("0.30");
	});

	it("multiplies and divides, rounding half away from zero only where asked", () => {
		expect(toText(mul(dec("49.99"), dec("0.05")))).toBe("2.4995");
		expect(toText(round(mul(dec("49.99"), dec("0.05")), 2), 2)).toBe("2.50");
		expect(toText(round(dec("-2.4995"), 2), 2)).toBe("-2.50");
		expect(toText(div(dec("3050"), dec("1.261")), 4)).toBe("2418.7153");
		expect(toText(div(dec("1"), dec("3")), 6)).toBe("0.333333");
		expect(toText(round(dec("2.5"), 0))).toBe("3");
		expect(toText(round(dec("2.4"), 0))).toBe("2");
	});

	it("reads plain numbers only, and says no to everything else", () => {
		expect(toText(dec("1,250.50"))).toBe("1250.5");
		expect(toText(dec("-0.125"))).toBe("-0.125");
		expect(toText(dec(12n))).toBe("12");
		for (const bad of ["", "abc", "1e5", "12 mL", "$5", "1.2.3", "--1", "0.1234567890123"])
			expect(() => dec(bad), bad).toThrow(DecimalError);
		expect(tryDec("abc")).toBeNull();
		expect(tryDec("")).toBeNull();
		expect(tryDec(undefined)).toBeNull();
		expect(tryDec("0")).toEqual({ v: 0n });
	});

	it("refuses to divide by zero and compares exactly", () => {
		expect(() => div(dec("1"), dec("0"))).toThrow(/Division by zero/);
		expect(cmp(dec("1.10"), dec("1.1"))).toBe(0);
		expect(cmp(dec("1.09"), dec("1.1"))).toBe(-1);
		expect(percentOf(dec("11"), dec("50"))).toBe("22.00");
		expect(percentOf(dec("1"), dec("0"))).toBeNull();
		expect(toNumber(dec("1.5"))).toBe(1.5);
		expect(toText(dec("0"))).toBe("0");
		expect(toText(dec("-0.004"), 2)).toBe("0.00");
	});
});

describe("reading a supplied table", () => {
	const columns = [
		{ key: "id", label: "Id", required: true },
		{ key: "amount", label: "Amount", required: true, kind: "decimal" as const, aliases: ["value"] },
		{ key: "date", label: "Date", kind: "date" as const },
		{ key: "note", label: "Note" },
	];
	const options = { label: "Lines", maxRows: 5 };

	it("reads CSV, tab-separated text and JSON the same way", () => {
		const csv = parseTable("id,amount,date\nA1,10.50,2026-10-01\nA2,3,", columns, options);
		expect(csv.problems).toEqual([]);
		expect(csv.rows).toEqual([
			{ id: "A1", amount: "10.50", date: "2026-10-01", note: "" },
			{ id: "A2", amount: "3", date: "", note: "" },
		]);
		expect(parseTable("id\tamount\nA1\t10.50", columns, options).rows[0]).toMatchObject({
			id: "A1",
			amount: "10.50",
		});
		expect(parseTable('[{"id":"A1","amount":10.5}]', columns, options).rows[0]).toMatchObject({
			id: "A1",
			amount: "10.5",
		});
		expect(parseTable([{ id: "A1", amount: "2" }], columns, options).format).toBe("records");
	});

	it("matches headers whatever their capitals, spacing or common alternative name", () => {
		const parsed = parseTable("ID , Value ,NOTE\nA1,5,hello", columns, options);
		expect(parsed.problems).toEqual([]);
		expect(parsed.rows[0]).toEqual({ id: "A1", amount: "5", note: "hello", date: "" });
	});

	it("keeps commas and quotes inside quoted cells", () => {
		expect(splitDelimited('a,"b, c","say ""hi"""\n1,2,3', ",")).toEqual([
			["a", "b, c", 'say "hi"'],
			["1", "2", "3"],
		]);
	});

	it("reports every problem with its row, and refuses the table", () => {
		const parsed = parseTable("id,amount,date\nA1,ten,2026-13-40\n,5,", columns, options);
		expect(parsed.problems).toEqual([
			'Lines, row 1: "amount" (ten) isn\'t a number.',
			'Lines, row 1: "date" (2026-13-40) isn\'t a date like 2026-10-31.',
			'Lines, row 2: "id" is empty.',
		]);
	});

	it("names a missing column, an empty table and one that is too long", () => {
		expect(parseTable("id,note\nA1,x", columns, options).problems).toEqual([
			'Lines is missing the column "amount".',
		]);
		expect(parseTable("", columns, { ...options, minRows: 1 }).problems[0]).toMatch(/Lines is empty/);
		expect(parseTable("id,amount\n" + "A,1\n".repeat(6), columns, options).problems[0]).toMatch(
			/has 6 rows; the most this function takes at once is 5/,
		);
		expect(parseTable("[not json", columns, options).problems).toEqual(["Lines: the JSON couldn't be read."]);
		expect(parseTable(42, columns, options).problems).toEqual(["Lines: must be text or a list of records."]);
	});

	it("knows a real date and a real instant", () => {
		expect(isIsoDay("2026-02-28")).toBe(true);
		expect(isIsoDay("2026-02-30")).toBe(false);
		expect(isIsoDay("26-02-28")).toBe(false);
		expect(isIsoInstant("2026-10-09T15:00:00Z")).toBe(true);
		expect(isIsoInstant("2026-10-09 15:00")).toBe(true);
		expect(isIsoInstant("2026-10-09")).toBe(false);
		expect(isIsoInstant("yesterday")).toBe(false);
	});

	it("reads a list one item per line, dropping bullets and blanks", () => {
		expect(parseList("- one\n2. two\n\n  three  ", 10)).toEqual(["one", "two", "three"]);
		expect(parseList(["a", "b", "c"], 2)).toEqual(["a", "b"]);
		expect(parseList(undefined, 5)).toEqual([]);
	});
});

describe("validating a function's input", () => {
	const fields: FieldSpec[] = [
		{ key: "name", label: "Name", kind: "text", required: true, max: 10 },
		{ key: "when", label: "When", kind: "date" },
		{ key: "howMany", label: "How many", kind: "integer" },
		{ key: "rate", label: "Rate", kind: "decimal" },
		{
			key: "mode",
			label: "Mode",
			kind: "select",
			required: true,
			options: [
				{ value: "a", label: "A" },
				{ value: "b", label: "B" },
			],
		},
		{ key: "items", label: "Items", kind: "list", required: true },
		{
			key: "lines",
			label: "Lines",
			kind: "table",
			required: true,
			columns: [{ key: "id", label: "Id", required: true }],
		},
	];

	it("accepts a complete input and drops fields nobody declared", () => {
		const parsed = parseInput(
			{ fields },
			{
				name: " Ada ",
				when: "2026-10-01",
				howMany: "3",
				rate: "1.5",
				mode: "a",
				items: "x\ny",
				lines: "id\n1\n2",
				admin: "true",
			},
		);
		expect(parsed).toEqual({
			ok: true,
			rowsRead: 2,
			input: {
				name: "Ada",
				when: "2026-10-01",
				howMany: "3",
				rate: "1.5",
				mode: "a",
				items: ["x", "y"],
				lines: [{ id: "1" }, { id: "2" }],
			},
		});
	});

	it("names every missing or malformed value, and defaults nothing", () => {
		const parsed = parseInput(
			{ fields },
			{
				name: "much too long a name",
				when: "tomorrow",
				howMany: "2.5",
				rate: "fast",
				mode: "c",
				items: "",
				lines: "",
			},
		);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.problems).toEqual([
			"Name is too long.",
			"When must be a date like 2026-10-31.",
			"How many must be a whole number.",
			"Rate must be a number.",
			"Mode must be one of: a, b.",
			"Items is required (one item per line).",
			"Lines is empty. Paste the rows with a header line: id.",
		]);
		expect(parseInput({ fields }, {})).toMatchObject({
			ok: false,
			problems: expect.arrayContaining(["Name is required.", "Mode is required."]),
		});
	});
});
