import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { freshDb, owner, staff } from "../testing.test-util";
import type { OperatorActor } from "../types";
import {
	addRecipeVersion,
	approveRecipeVersion,
	completeBatch,
	createRecipe,
	getBatch,
	planBatch,
	reserveBatch,
	type Batch,
} from "./batches";
import {
	addEquipment,
	equipmentStanding,
	getEquipment,
	listCleaning,
	listEquipment,
	listEquipmentUse,
	recordCalibration,
	recordCleaning,
	recordEquipmentUse,
	setEquipmentStatus,
	verifyCleaning,
	type Calibration,
	type Equipment,
} from "./equipment";
import { decideRelease, listHolds, recordPackagingRun } from "./finished";
import { createIngredient, createLot, postMovement } from "./inventory";
import {
	listRequirements,
	listTraining,
	qualificationGaps,
	recordTraining,
	removeRequirement,
	setRequirement,
	trainingStanding,
	verifyTraining,
	type TrainingRecord,
} from "./training";

let sql: SqlClient;
const TODAY = "2026-10-20";
let serial = 0;
const key = () => `equipment-test-${++serial}-${Math.random().toString(36).slice(2)}`;
const ids: Record<string, string> = {};
const other: OperatorActor = { kind: "operator", id: "staff-2", label: "Pat Packer", role: "staff" };

async function stock(name: string, ingredient: Parameters<typeof createIngredient>[2], lotCode: string) {
	const made = await createIngredient(sql, staff, ingredient);
	const lot = await createLot(sql, staff, { ingredientId: made.id, lotCode, unit: "mL" });
	await postMovement(
		sql,
		staff,
		{ lotId: lot.id, kind: "receipt", quantity: "50000", idempotencyKey: key() },
		TODAY,
	);
	ids[name] = made.id;
}

async function reserved(): Promise<Batch> {
	const batch = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
	return reserveBatch(sql, staff, batch.id, TODAY);
}
const make = (batch: Batch, actor: OperatorActor = staff) =>
	completeBatch(sql, actor, batch.id, { actualYieldMl: "990" }, TODAY);

let codes = 0;
const equipment = (changes: Partial<Parameters<typeof addEquipment>[2]> = {}) =>
	addEquipment(sql, staff, {
		code: `SC-${++codes}`,
		name: "Bench scale 3 kg",
		kind: "scale",
		location: "Mixing bench",
		calibrationIntervalDays: "180",
		...changes,
	});
const calibrate = (equipmentId: string, changes: Record<string, string> = {}, actor: OperatorActor = staff) =>
	recordCalibration(
		sql,
		actor,
		{
			equipmentId,
			performedOn: "2026-10-01",
			result: "pass",
			certificate: "CERT-1001",
			performedBy: "Prairie Scale Service",
			...changes,
		},
		TODAY,
	);

beforeAll(async () => {
	sql = await freshDb();
	await stock("pg", { name: "PG USP", category: "pg" }, "PG-1");
	await stock("vg", { name: "VG USP", category: "vg" }, "VG-1");
	await stock(
		"base",
		{
			name: "Nic base 100",
			category: "nicotine_base",
			nicotineMgPerMl: "100",
			pgPercent: "90",
			vgPercent: "0",
		},
		"N-1",
	);
	await stock(
		"mango",
		{ name: "Mango concentrate", category: "flavour", pgPercent: "100", vgPercent: "0" },
		"M-1",
	);
	const recipe = await createRecipe(sql, staff, { name: "Equipment Mango" });
	const version = await addRecipeVersion(sql, staff, {
		recipeId: recipe.id,
		batchMl: "1000",
		targetNicotineMgPerMl: "12",
		targetPgPercent: "50",
		baseIngredientId: ids.base,
		pgIngredientId: ids.pg,
		vgIngredientId: ids.vg,
		flavours: [{ ingredientId: ids.mango, percent: "10" }],
	});
	await approveRecipeVersion(sql, owner, version.id);
	ids.version = version.id;
});
afterAll(async () => {
	await sql.close();
});

describe("where a piece of equipment stands", () => {
	const scale: Equipment = {
		id: "e",
		code: "SC-1",
		name: "Bench scale",
		kind: "scale",
		location: null,
		calibrationIntervalDays: 180,
		status: "in_service",
		statusReason: null,
		createdAt: "",
	};
	const calibration = (changes: Partial<Calibration>): Calibration => ({
		id: "c",
		equipmentId: "e",
		performedOn: "2026-10-01",
		result: "pass",
		certificate: "CERT-1",
		performedBy: "Service",
		dueOn: "2027-03-30",
		notes: null,
		recordedBy: "operator:staff-1",
		recordedAt: "2026-10-01T15:00:00.000Z",
		...changes,
	});

	it("is never assumed to be calibrated when nothing is on record", () => {
		expect(equipmentStanding(scale, [], TODAY)).toEqual({
			eligible: false,
			calibration: "never",
			dueOn: null,
			reasons: ["It needs calibrating and no calibration is on record. One is never assumed."],
		});
		// Equipment that needs no calibration is not held to one.
		expect(equipmentStanding({ ...scale, calibrationIntervalDays: null }, [], TODAY)).toMatchObject({
			eligible: true,
			calibration: "not_required",
		});
	});

	it("is in calibration until the day after it was due, and says when that is close", () => {
		expect(equipmentStanding(scale, [calibration({})], TODAY)).toMatchObject({
			eligible: true,
			calibration: "current",
			dueOn: "2027-03-30",
		});
		expect(equipmentStanding(scale, [calibration({ dueOn: "2026-11-01" })], TODAY).calibration).toBe(
			"due_soon",
		);
		// Due today is still in date.
		expect(equipmentStanding(scale, [calibration({ dueOn: TODAY })], TODAY)).toMatchObject({
			eligible: true,
			calibration: "due_soon",
		});
		expect(equipmentStanding(scale, [calibration({ dueOn: "2026-10-19" })], TODAY)).toEqual({
			eligible: false,
			calibration: "overdue",
			dueOn: "2026-10-19",
			reasons: ["Its calibration was due on 2026-10-19."],
		});
		// With no date given, the next one is due an interval after the last.
		expect(
			equipmentStanding(scale, [calibration({ dueOn: null, performedOn: "2026-04-01" })], TODAY),
		).toMatchObject({ calibration: "overdue", dueOn: "2026-09-28" });
	});

	it("goes by the newest calibration, so a failure after a pass counts and an old failure doesn't", () => {
		const pass = calibration({ id: "p", performedOn: "2026-06-01" });
		const fail = calibration({
			id: "f",
			performedOn: "2026-10-10",
			result: "fail",
			dueOn: null,
			certificate: "CERT-9",
		});
		expect(equipmentStanding(scale, [pass, fail], TODAY)).toMatchObject({
			eligible: false,
			calibration: "failed",
			reasons: ["It failed calibration on 2026-10-10 (CERT-9) and has not passed one since."],
		});
		const later = calibration({ id: "l", performedOn: "2026-10-15" });
		expect(equipmentStanding(scale, [pass, fail, later], TODAY)).toMatchObject({
			eligible: true,
			calibration: "current",
		});
		expect(
			equipmentStanding({ ...scale, status: "out_of_service", statusReason: "Dropped" }, [later], TODAY),
		).toMatchObject({ eligible: false, reasons: ["Out of service: Dropped"] });
	});
});

describe("equipment", () => {
	it("is recorded once under its code, with what it needs", async () => {
		const scale = await equipment({ code: "SC-A" });
		expect(scale).toMatchObject({
			code: "SC-A",
			kind: "scale",
			calibrationIntervalDays: 180,
			status: "in_service",
		});
		await expect(equipment({ code: "sc-a" })).rejects.toThrow("Equipment sc-a is already recorded.");
		await expect(equipment({ code: "" })).rejects.toThrow("Give it a short code");
		await expect(equipment({ kind: "robot" })).rejects.toThrow("Choose what kind of equipment it is.");
		await expect(equipment({ calibrationIntervalDays: "often" })).rejects.toThrow("whole number of days");
		await expect(equipment({ calibrationIntervalDays: "0" })).rejects.toThrow("at least one day");
		const row = (await listEquipment(sql, TODAY)).find((r) => r.equipment.id === scale.id);
		expect(row).toMatchObject({ standing: { eligible: false, calibration: "never" }, lastCalibration: null });
	});

	it("can't be recorded against a batch until a calibration is on record, and not once it is overdue", async () => {
		const scale = await equipment();
		const batch = await reserved();
		const use = () =>
			recordEquipmentUse(
				sql,
				staff,
				{ batchId: batch.id, equipmentId: scale.id, purpose: "Weighing the nicotine base" },
				TODAY,
			);
		await expect(use()).rejects.toThrow(
			`${scale.code} can't be recorded against a batch. It needs calibrating and no calibration is on record. One is never assumed.`,
		);
		await expect(calibrate(scale.id, { certificate: "" })).rejects.toThrow(
			"A calibration is never recorded without one.",
		);
		await expect(calibrate(scale.id, { performedOn: "2026-10-21" })).rejects.toThrow("can't be after today");
		await expect(calibrate(scale.id, { performedBy: "" })).rejects.toThrow("Say who carried it out");
		await expect(calibrate(scale.id, { dueOn: "2026-10-01" })).rejects.toThrow(
			"must be after the calibration date",
		);

		// An old calibration that has since lapsed doesn't make it eligible.
		await calibrate(scale.id, { performedOn: "2026-01-05", certificate: "CERT-0900" });
		await expect(use()).rejects.toThrow("Its calibration was due on 2026-07-04.");

		const done = await calibrate(scale.id);
		expect(done.calibration).toMatchObject({ result: "pass", dueOn: "2027-03-30" });
		expect(done.held).toEqual([]);
		const recorded = await use();
		expect(recorded).toMatchObject({
			equipmentCode: scale.code,
			batchCode: batch.code,
			purpose: "Weighing the nicotine base",
			usedOn: TODAY,
		});
		// Recording the same use twice is one line.
		expect((await use()).id).toBe(recorded.id);
		expect(await listEquipmentUse(sql, { batchId: batch.id })).toHaveLength(1);

		const planned = await planBatch(sql, staff, { recipeVersionId: ids.version, batchMl: "1000" }, TODAY);
		await expect(
			recordEquipmentUse(
				sql,
				staff,
				{ batchId: planned.id, equipmentId: scale.id, purpose: "Weighing" },
				TODAY,
			),
		).rejects.toThrow(
			"is planned. Equipment is recorded against a batch that is being made or has been made.",
		);
		await expect(
			recordEquipmentUse(sql, staff, { batchId: batch.id, equipmentId: scale.id, purpose: "" }, TODAY),
		).rejects.toThrow("Say what it was used for");
	});

	it("that fails calibration goes out of service and holds every batch measured since it last passed", async () => {
		const scale = await equipment();
		await calibrate(scale.id, { performedOn: "2026-09-01", certificate: "CERT-2000" });
		const use = async (batch: Batch) =>
			recordEquipmentUse(
				sql,
				staff,
				{ batchId: batch.id, equipmentId: scale.id, purpose: "Weighing" },
				TODAY,
			);
		const first = await make(await reserved());
		const second = await make(await reserved());
		const rejected = await make(await reserved());
		const untouched = await make(await reserved());
		await use(first);
		await use(second);
		await use(rejected);
		await decideRelease(sql, owner, { batchId: rejected.id, decision: "rejected", note: "Spilled." });

		const failed = await calibrate(scale.id, {
			performedOn: "2026-10-19",
			result: "fail",
			certificate: "CERT-2044",
		});
		expect(failed.equipment).toMatchObject({
			status: "out_of_service",
			statusReason: "Failed calibration on 2026-10-19 (CERT-2044).",
		});
		// A rejected batch needs no hold; a batch it was never used on is not touched.
		expect(failed.held.sort()).toEqual([first.code, second.code].sort());
		expect((await listHolds(sql, first.id)).map((hold) => hold.reason)).toEqual([
			`${scale.code} (Bench scale 3 kg) failed calibration on 2026-10-19 (CERT-2044). This batch was measured with it since its last passing calibration on 2026-09-01.`,
		]);
		expect(await listHolds(sql, rejected.id)).toEqual([]);
		expect(await listHolds(sql, untouched.id)).toEqual([]);
		// The hold is real.
		await expect(
			recordPackagingRun(
				sql,
				staff,
				{
					batchId: first.id,
					sku: "MANGO-12-30",
					bottleMl: "30",
					unitsFilled: "5",
					bulkUsedMl: "150",
					labelVersion: "Label 3",
					lineClearance: "Line cleared.",
					idempotencyKey: key(),
				},
				TODAY,
			),
		).rejects.toThrow("is on hold");

		// It can't be used again, and can't simply be switched back on.
		await expect(use(untouched)).rejects.toThrow(
			"Out of service: Failed calibration on 2026-10-19 (CERT-2044).",
		);
		await expect(
			setEquipmentStatus(sql, staff, { equipmentId: scale.id, status: "in_service", reason: "Looks fine" }),
		).rejects.toThrow("Only the owner can return equipment to service.");
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "equipment.return", outcome: "denied" });
		await expect(
			setEquipmentStatus(sql, owner, { equipmentId: scale.id, status: "in_service", reason: "Looks fine" }),
		).rejects.toThrow("Record a passing calibration before returning it to service.");

		// A pass doesn't put it back in service by itself: that is the owner's decision.
		await calibrate(scale.id, { performedOn: "2026-10-20", certificate: "CERT-2050" });
		await expect(use(untouched)).rejects.toThrow("Out of service");
		await expect(
			setEquipmentStatus(sql, owner, { equipmentId: scale.id, status: "in_service", reason: "" }),
		).rejects.toThrow("Say on what basis");
		expect(
			await setEquipmentStatus(sql, owner, {
				equipmentId: scale.id,
				status: "in_service",
				reason: "Serviced and passed, CERT-2050.",
			}),
		).toMatchObject({ status: "in_service", statusReason: null });
		expect((await use(untouched)).batchCode).toBe(untouched.code);
		// The batches it held stay held until the owner lifts each one.
		expect((await listHolds(sql, second.id)).filter((hold) => hold.liftedAt === null)).toHaveLength(1);
	});

	it("with no passing calibration before a failure holds every batch it was ever used on", async () => {
		const meter = await equipment({
			code: "PH-1",
			name: "pH meter",
			kind: "instrument",
			calibrationIntervalDays: "",
		});
		const batch = await make(await reserved());
		// No calibration is required, so it can be used.
		await recordEquipmentUse(
			sql,
			staff,
			{ batchId: batch.id, equipmentId: meter.id, purpose: "pH check" },
			TODAY,
		);
		const failed = await calibrate(meter.id, {
			result: "fail",
			performedOn: "2026-10-20",
			certificate: "Buffer 7.00",
		});
		expect(failed.held).toEqual([batch.code]);
		expect((await listHolds(sql, batch.id))[0].reason).toBe(
			"PH-1 (pH meter) failed calibration on 2026-10-20 (Buffer 7.00). This batch was measured with it and no passing calibration is on record before that.",
		);
	});

	it("can be taken out of service by anyone with a reason", async () => {
		const mixer = await equipment({
			code: "MX-1",
			name: "Overhead mixer",
			kind: "mixer",
			calibrationIntervalDays: "",
		});
		await expect(
			setEquipmentStatus(sql, staff, { equipmentId: mixer.id, status: "out_of_service", reason: "" }),
		).rejects.toThrow("Say why it is being taken out of service.");
		expect(
			await setEquipmentStatus(sql, staff, {
				equipmentId: mixer.id,
				status: "out_of_service",
				reason: "Shaft seal leaking",
			}),
		).toMatchObject({ status: "out_of_service", statusReason: "Shaft seal leaking" });
		await expect(
			setEquipmentStatus(sql, staff, { equipmentId: mixer.id, status: "out_of_service", reason: "Again" }),
		).rejects.toThrow("already out of service");
		const detail = await getEquipment(sql, mixer.id, TODAY);
		expect(detail?.standing).toMatchObject({
			eligible: false,
			reasons: ["Out of service: Shaft seal leaking"],
		});
	});
});

describe("a cleaning or line clearance", () => {
	it("names what was cleaned and the procedure, and is verified by a second person", async () => {
		const filler = await equipment({
			code: "FL-1",
			name: "Bottle filler",
			kind: "filler",
			calibrationIntervalDays: "",
		});
		const record = (changes: Record<string, string> = {}) =>
			recordCleaning(sql, staff, {
				equipmentId: filler.id,
				kind: "cleaning",
				procedure: "SOP-CL-02 revision 3",
				detail: "Flushed with PG, wiped down, visually clean.",
				...changes,
			});
		await expect(record({ kind: "rinse" })).rejects.toThrow("Choose a cleaning or a line clearance.");
		await expect(record({ equipmentId: "" })).rejects.toThrow("choose the equipment, or name the area");
		await expect(record({ procedure: "" })).rejects.toThrow("Name the procedure");
		await expect(record({ detail: "" })).rejects.toThrow("Say what was done and what was checked.");

		const done = await record();
		expect(done).toMatchObject({ equipmentCode: "FL-1", doneBy: "operator:staff-1", verifiedAt: null });
		await expect(verifyCleaning(sql, staff, done.id)).rejects.toThrow(
			"You recorded this one, so someone else has to verify it.",
		);
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "cleaning.verify", outcome: "denied" });
		expect(await verifyCleaning(sql, other, done.id)).toMatchObject({ verifiedBy: "operator:staff-2" });
		await expect(verifyCleaning(sql, owner, done.id)).rejects.toThrow("already been verified");

		// A line clearance of an area, with no equipment.
		const clearance = await record({ equipmentId: "", area: "Packing bench", kind: "line_clearance" });
		expect(clearance).toMatchObject({ equipmentId: null, area: "Packing bench", kind: "line_clearance" });
		expect((await listCleaning(sql, { equipmentId: filler.id })).map((c) => c.id)).toEqual([done.id]);
	});
});

describe("training", () => {
	const record = (actor: OperatorActor, changes: Partial<Parameters<typeof recordTraining>[2]> = {}) =>
		recordTraining(
			sql,
			actor,
			{
				forSelf: true,
				topic: "Batch manufacturing SOP-MF-01 revision 2",
				completedOn: "2026-09-15",
				validUntil: "2027-09-15",
				evidence: "Signed sheet in the training binder",
				...changes,
			},
			TODAY,
		);

	it("says where a record stands from its dates and whether the owner has verified it", () => {
		const base: TrainingRecord = {
			id: "t",
			person: "Sam",
			personKey: "operator:staff-1",
			topic: "Topic",
			completedOn: "2026-01-01",
			validUntil: "2027-01-01",
			evidence: "Sheet",
			recordedBy: "operator:staff-1",
			recordedAt: "",
			verifiedBy: null,
			verifiedAt: null,
		};
		expect(trainingStanding(base, TODAY)).toBe("unverified");
		const verified = { ...base, verifiedBy: "operator:owner-1", verifiedAt: "2026-01-02T00:00:00.000Z" };
		expect(trainingStanding(verified, TODAY)).toBe("valid");
		expect(trainingStanding({ ...verified, validUntil: null }, TODAY)).toBe("valid");
		expect(trainingStanding({ ...verified, validUntil: "2026-11-10" }, TODAY)).toBe("expiring");
		expect(trainingStanding({ ...verified, validUntil: TODAY }, TODAY)).toBe("expiring");
		expect(trainingStanding({ ...verified, validUntil: "2026-10-19" }, TODAY)).toBe("expired");
	});

	it("needs evidence and real dates, and counts only once the owner has verified it", async () => {
		await expect(record(staff, { topic: "" })).rejects.toThrow("Say what the training was");
		await expect(record(staff, { evidence: "" })).rejects.toThrow("Attendance is never assumed.");
		await expect(record(staff, { completedOn: "2026-10-21" })).rejects.toThrow("can't be after today");
		await expect(record(staff, { validUntil: "2026-09-01" })).rejects.toThrow("before the completion date");
		await expect(record(staff, { forSelf: false, person: "" })).rejects.toThrow(
			"Say who completed the training.",
		);

		const mine = await record(staff);
		expect(mine).toMatchObject({ person: "Sam Staff", personKey: "operator:staff-1", verifiedAt: null });
		await expect(verifyTraining(sql, staff, mine.id)).rejects.toThrow(
			"Only the owner can verify a training record.",
		);
		expect(await verifyTraining(sql, owner, mine.id)).toMatchObject({ verifiedBy: "operator:owner-1" });
		await expect(verifyTraining(sql, owner, mine.id)).rejects.toThrow("already been verified");
		// Recorded by name only, for someone without a sign-in: kept, tied to nobody.
		const named = await record(owner, { forSelf: false, person: "Jo Temp" });
		expect(named).toMatchObject({ person: "Jo Temp", personKey: null });
		expect((await listTraining(sql)).map((r) => r.person)).toEqual(
			expect.arrayContaining(["Sam Staff", "Jo Temp"]),
		);
	});

	it("gates nothing until the owner requires it, then refuses a person without it and logs the refusal", async () => {
		const topic = "Packaging SOP-PK-01 revision 1";
		const batch = await make(await reserved());
		const pack = (actor: OperatorActor) =>
			recordPackagingRun(
				sql,
				actor,
				{
					batchId: batch.id,
					sku: "MANGO-12-30",
					bottleMl: "30",
					unitsFilled: "2",
					bulkUsedMl: "60",
					labelVersion: "Label 3",
					lineClearance: "Line cleared.",
					idempotencyKey: key(),
				},
				TODAY,
			);
		// With no requirement, anyone in the workspace can record a run.
		expect((await pack(other)).unitsFilled).toBe(2);

		await expect(setRequirement(sql, staff, { step: "package_batch", topic })).rejects.toThrow(
			"Only the owner can change what training a step requires.",
		);
		await expect(setRequirement(sql, owner, { step: "ship", topic })).rejects.toThrow("Choose the step");
		await setRequirement(sql, owner, { step: "package_batch", topic });
		// Setting the same requirement twice is one requirement.
		expect(
			(await setRequirement(sql, owner, { step: "package_batch", topic: ` ${topic.toUpperCase()} ` })).length,
		).toBe(1);
		expect(await qualificationGaps(sql, "operator:staff-2", "package_batch", TODAY)).toEqual([topic]);

		const before = (await getBatch(sql, batch.id))?.bulkRemainingMl;
		await expect(pack(other)).rejects.toThrow(
			`Recording a packaging run needs verified, in-date training in: ${topic}. None is on file for you.`,
		);
		expect((await listAudit(sql, 1))[0]).toMatchObject({
			action: "training.gate",
			outcome: "denied",
			actor: "operator:staff-2",
			subject: "package_batch",
		});
		// Refused before anything was touched.
		expect((await getBatch(sql, batch.id))?.bulkRemainingMl).toBe(before);
		// It applies to the owner too.
		await expect(pack(owner)).rejects.toThrow("None is on file for you.");

		// Recorded but not verified is not enough; nor is training that has lapsed.
		const entered = await record(other, { topic });
		await expect(pack(other)).rejects.toThrow("None is on file for you.");
		await verifyTraining(sql, owner, entered.id);
		expect((await pack(other)).unitsFilled).toBe(2);
		const lapsed = await record(staff, { topic, completedOn: "2025-09-01", validUntil: "2026-09-01" });
		await verifyTraining(sql, owner, lapsed.id);
		await expect(pack(staff)).rejects.toThrow("None is on file for you.");

		// Making a batch has its own requirement, and none is set, so it isn't gated.
		expect((await make(await reserved(), other)).status).toBe("completed");
		await setRequirement(sql, owner, {
			step: "make_batch",
			topic: "Batch manufacturing SOP-MF-01 revision 2",
		});
		const waiting = await reserved();
		await expect(make(waiting, other)).rejects.toThrow(
			"Recording a batch as made needs verified, in-date training",
		);
		expect((await getBatch(sql, waiting.id))?.status).toBe("reserved");
		// Sam holds that training, verified, from the test above.
		expect((await make(waiting, staff)).status).toBe("completed");

		// The owner can lift a requirement, and the step is open again.
		const [packaging] = (await listRequirements(sql)).filter((r) => r.step === "package_batch");
		await expect(removeRequirement(sql, staff, packaging.id)).rejects.toThrow("Only the owner");
		await removeRequirement(sql, owner, packaging.id);
		expect((await pack(staff)).unitsFilled).toBe(2);
		for (const requirement of await listRequirements(sql))
			await removeRequirement(sql, owner, requirement.id);
	});
});
