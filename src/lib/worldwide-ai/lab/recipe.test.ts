import { describe, expect, it } from "vitest";
import { RecipeError, calculateRecipe, convert, type RecipeInput } from "./recipe";

const recipe = (changes: Partial<RecipeInput> = {}): RecipeInput => ({
	batchMl: "1000",
	targetNicotineMgPerMl: "12",
	targetPgPercent: "50",
	// A 100 mg/mL base that is 90% PG; the other 10% is the nicotine itself.
	nicotineBase: { strengthMgPerMl: "100", pgPercent: "90", vgPercent: "0", density: "1.035" },
	flavours: [{ name: "Mango", percent: "10", pgPercent: "100", vgPercent: "0" }],
	pgDensity: "1.036",
	vgDensity: "1.261",
	...changes,
});

const byName = (result: ReturnType<typeof calculateRecipe>) =>
	Object.fromEntries(result.lines.map((l) => [l.ingredient, l]));

describe("the recipe calculation", () => {
	it("works out the nicotine base from target × batch ÷ strength", () => {
		const result = calculateRecipe(recipe());
		expect(byName(result)["Nicotine base (100 mg/mL)"]).toMatchObject({
			millilitres: "120.00",
			percentOfBatch: "12.00",
			grams: "124.20",
		});
		expect(result.totals.calculatedNicotineMgPerMl).toBe("12.00");
	});

	it("counts the PG a base and a flavour bring with them before adding more", () => {
		const result = calculateRecipe(recipe());
		// 108 mL of PG comes with the base and 100 mL with the flavour; 12 mL is neither PG nor VG.
		// The remaining 988 mL splits 50:50, so 494 mL each, of which 208 mL of PG is already there.
		expect(byName(result)["PG to add"].millilitres).toBe("286.00");
		expect(byName(result)["VG to add"].millilitres).toBe("494.00");
		expect(result.totals).toMatchObject({
			pgMl: "494.00",
			vgMl: "494.00",
			otherMl: "12.00",
			pgShareOfPgVg: "50.00",
			nominalMl: "1000.00",
			flavourPercent: "10.00",
		});
	});

	it("gives a weight only where a density is documented, and never assumes 1 mL is 1 gram", () => {
		const result = calculateRecipe(recipe());
		expect(byName(result)["PG to add"]).toMatchObject({
			grams: "296.30",
			basis: "Weight calculated at 1.036 g/mL",
		});
		expect(byName(result)["VG to add"]).toMatchObject({ grams: "622.93" });
		expect(byName(result).Mango).toMatchObject({
			millilitres: "100.00",
			grams: null,
			basis: "No documented density: weight unavailable",
		});
		expect(result.totals.grams).toBeNull();
		expect(result.notes[0]).toBe(
			"No density was given for: Mango. Their weights, and the batch's total weight, are unavailable. Weigh by volume, or enter the documented density.",
		);

		const complete = calculateRecipe(
			recipe({
				flavours: [{ name: "Mango", percent: "10", pgPercent: "100", vgPercent: "0", density: "1.04" }],
			}),
		);
		expect(byName(complete).Mango.grams).toBe("104.00");
		// 124.20 + 104.00 + 296.296 + 622.934
		expect(complete.totals.grams).toBe("1147.43");
		expect(Number(complete.totals.grams)).not.toBe(1000);
	});

	it("handles a zero-nicotine batch without a base", () => {
		const result = calculateRecipe(
			recipe({
				targetNicotineMgPerMl: "0",
				nicotineBase: { strengthMgPerMl: "", pgPercent: "", vgPercent: "" },
			}),
		);
		expect(result.lines.map((l) => l.ingredient)).toEqual(["Mango", "PG to add", "VG to add"]);
		expect(result.totals.calculatedNicotineMgPerMl).toBe("0.00");
		expect(byName(result)["PG to add"].millilitres).toBe("400.00");
		expect(byName(result)["VG to add"].millilitres).toBe("500.00");
		expect(result.notes).toContain("Zero-nicotine batch: no nicotine base is used.");
	});

	it("does not treat a base or a flavour as all PG", () => {
		const vgBase = calculateRecipe(
			recipe({
				nicotineBase: { strengthMgPerMl: "100", pgPercent: "0", vgPercent: "90" },
				flavours: [{ name: "Berry", percent: "10", pgPercent: "50", vgPercent: "50" }],
			}),
		);
		// Base brings 108 mL VG; flavour brings 50 PG and 50 VG; other 12. 988 splits 494/494.
		expect(byName(vgBase)["PG to add"].millilitres).toBe("444.00");
		expect(byName(vgBase)["VG to add"].millilitres).toBe("336.00");
	});

	it("refuses a recipe that can't be made, saying why", () => {
		expect(() => calculateRecipe(recipe({ targetPgPercent: "10" }))).toThrow(
			/already bring 208\.00 mL of PG, more than the 98\.80 mL this ratio allows/,
		);
		expect(() => calculateRecipe(recipe({ targetNicotineMgPerMl: "120" }))).toThrow(/higher than the base's/);
		expect(() =>
			calculateRecipe(recipe({ nicotineBase: { strengthMgPerMl: "0", pgPercent: "100", vgPercent: "0" } })),
		).toThrow("Nicotine base strength must be more than zero.");
		expect(() =>
			calculateRecipe(
				recipe({ flavours: [{ name: "Too much", percent: "95", pgPercent: "100", vgPercent: "0" }] }),
			),
		).toThrow(/together are more than the batch/);
		expect(() =>
			calculateRecipe(
				recipe({ flavours: [{ name: "Odd", percent: "5", pgPercent: "70", vgPercent: "40" }] }),
			),
		).toThrow("Odd: PG and VG together can't be more than 100 percent.");
		expect(() => calculateRecipe(recipe({ batchMl: "0" }))).toThrow("Batch size must be more than zero.");
		expect(() => calculateRecipe(recipe({ batchMl: "a litre" }))).toThrow(RecipeError);
		expect(() => calculateRecipe(recipe({ pgDensity: "-1" }))).toThrow(/PG density/);
	});

	it("keeps exact decimals through awkward numbers", () => {
		const result = calculateRecipe(
			recipe({
				batchMl: "30",
				targetNicotineMgPerMl: "3",
				nicotineBase: { strengthMgPerMl: "72", pgPercent: "100", vgPercent: "0" },
				flavours: [],
				targetPgPercent: "30",
			}),
		);
		// 3 × 30 ÷ 72 = 1.25 mL of base exactly.
		expect(byName(result)["Nicotine base (72 mg/mL)"].millilitres).toBe("1.25");
		expect(byName(result)["PG to add"].millilitres).toBe("7.75");
		expect(byName(result)["VG to add"].millilitres).toBe("21.00");
		expect(result.totals.nominalMl).toBe("30.00");
	});
});

describe("converting between volume and weight", () => {
	it("uses grams = mL × density and mL = grams ÷ density", () => {
		expect(convert("100", "mL", "1.261")).toEqual({
			millilitres: "100.000",
			grams: "126.100",
			basis: "Calculated at 1.261 g/mL",
		});
		expect(convert("126.1", "g", "1.261")).toEqual({
			millilitres: "100.000",
			grams: "126.100",
			basis: "Calculated at 1.261 g/mL",
		});
	});

	it("leaves the other unit unavailable when there is no density", () => {
		expect(convert("100", "mL", "")).toEqual({
			millilitres: "100.000",
			grams: null,
			basis: "No density: the weight is unavailable",
		});
		expect(convert("100", "g", undefined)).toEqual({
			millilitres: null,
			grams: "100.000",
			basis: "No density: the volume is unavailable",
		});
		expect(() => convert("100", "mL", "0")).toThrow("Density must be more than zero.");
	});
});
