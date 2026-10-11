import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import type { SqlClient } from "../db/sql";
import { addEquipment } from "../lab/equipment";
import { freshDb, owner, staff } from "../testing.test-util";
import {
	assignTag,
	endAssignment,
	getTag,
	listExceptions,
	listScans,
	listTags,
	normalizeUid,
	recordScan,
	registerTags,
	resolveException,
	setTagStatus,
	tagCounts,
	verifyTag,
	type NewAssignment,
	type NewScan,
	type Tag,
} from "./registry";

let sql: SqlClient;
const NOW = new Date("2026-10-21T15:00:00Z");
let serial = 0;
/** A fresh 96-bit UHF identifier. */
const epc = () => `E28011700000020${String(++serial).padStart(9, "0")}`;
/** A fresh 7-byte NFC identifier. */
const nfc = () => `04${String(++serial).padStart(12, "0")}`;

async function uhf(count = 1): Promise<Tag[]> {
	return registerTags(sql, staff, {
		technology: "uhf_rfid",
		security: "plain",
		uids: Array.from({ length: count }, epc).join("\n"),
		sourceRef: "Roll R-12",
	});
}
const assign = (tagId: string, changes: Partial<NewAssignment> = {}) =>
	assignTag(sql, staff, {
		tagId,
		subjectKind: "product_unit",
		subjectRef: "Mango 12, 30 mL",
		sku: "MANGO-12-30",
		...changes,
	});
const scan = (uid: string, changes: Partial<NewScan> = {}, at: Date = NOW) =>
	recordScan(
		sql,
		staff,
		{
			technology: "uhf_rfid",
			uid,
			station: "Dock reader 1",
			workflow: "receiving",
			source: "simulated",
			...changes,
		},
		at,
	);

beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

describe("a tag identifier", () => {
	it("is stored the same however a reader or a label prints it", () => {
		expect(normalizeUid("nfc", "04:a2:2b:c1:9d:3f:80")).toBe("04A22BC19D3F80");
		expect(normalizeUid("nfc", " 04 A2 2B C1 ")).toBe("04A22BC1");
		expect(normalizeUid("uhf_rfid", "e280-1170-0000-0201-0000-0001")).toBe("E28011700000020100000001");
		expect(normalizeUid("uhf_rfid", "0xE280117000000201")).toBe("E280117000000201");
	});

	it("is refused, not guessed at, when it isn't one", () => {
		expect(() => normalizeUid("nfc", "")).toThrow("Enter the tag's identifier.");
		expect(() => normalizeUid("nfc", "tag-17")).toThrow("It should be hexadecimal");
		// Six bytes is not an NFC UID length.
		expect(() => normalizeUid("nfc", "04A22BC19D3F")).toThrow("4, 7 or 10 bytes");
		// A UHF identifier comes in whole 16-bit words.
		expect(() => normalizeUid("uhf_rfid", "E28011700000020")).toThrow("whole number of 16-bit words");
		expect(() => normalizeUid("uhf_rfid", "E280")).toThrow("16 to 124 characters");
	});
});

describe("registering tags", () => {
	it("registers a roll in one step, each tag once, and keeps the two technologies apart", async () => {
		const first = epc();
		const second = epc();
		const tags = await registerTags(sql, staff, {
			technology: "uhf_rfid",
			security: "plain",
			uids: `${first}\n\n ${second.toLowerCase()} `,
			sourceRef: "Roll R-7",
		});
		expect(tags.map((t) => [t.uid, t.technology, t.status, t.sourceRef, t.verifiedAt])).toEqual([
			[first, "uhf_rfid", "active", "Roll R-7", null],
			[second, "uhf_rfid", "active", "Roll R-7", null],
		]);
		// All or nothing: one known tag in the list and none is registered.
		const fresh = epc();
		await expect(
			registerTags(sql, staff, { technology: "uhf_rfid", security: "plain", uids: `${fresh}\n${first}` }),
		).rejects.toThrow(`Nothing was registered. Already in the registry: ${first}.`);
		expect((await listTags(sql, { q: fresh })).length).toBe(0);
		await expect(
			registerTags(sql, staff, {
				technology: "uhf_rfid",
				security: "plain",
				uids: `${fresh}\nnot a tag\n${fresh}`,
			}),
		).rejects.toThrow(/Nothing was registered\. Line 2: .*hexadecimal.* Line 3: .* is listed twice\./);
		await expect(
			registerTags(sql, staff, { technology: "barcode", security: "plain", uids: fresh }),
		).rejects.toThrow("Choose UHF RFID or NFC. They are different kinds of tag.");
		await expect(
			registerTags(sql, staff, { technology: "nfc", security: "magic", uids: nfc() }),
		).rejects.toThrow("Choose what the tag itself can do.");
		await expect(
			registerTags(sql, staff, { technology: "nfc", security: "plain", uids: " \n " }),
		).rejects.toThrow("Enter at least one tag identifier.");

		// The same digits as an NFC tag are a different tag.
		const shared = "04A22BC19D3F80";
		await registerTags(sql, staff, { technology: "nfc", security: "cryptographic", uids: shared });
		expect((await listTags(sql, { q: shared })).map((r) => [r.tag.technology, r.tag.security])).toEqual([
			["nfc", "cryptographic"],
		]);
	});

	it("is confirmed once by a person who read it", async () => {
		const [tag] = await uhf();
		expect(await verifyTag(sql, staff, tag.id)).toMatchObject({ verifiedBy: "operator:staff-1" });
		await expect(verifyTag(sql, owner, tag.id)).rejects.toThrow("already confirmed");
	});
});

describe("what a tag is attached to", () => {
	it("is one thing at a time, with the earlier ones kept as history", async () => {
		const [tag] = await uhf();
		const first = await assign(tag.id, { serial: "SN-0001", lot: "B-20261020-001-P1" });
		expect(first).toMatchObject({
			subjectKind: "product_unit",
			subjectRef: "Mango 12, 30 mL",
			sku: "MANGO-12-30",
			lot: "B-20261020-001-P1",
			serial: "SN-0001",
			assignedBy: "operator:staff-1",
			endedAt: null,
		});
		await expect(assign(tag.id, { subjectRef: "Something else" })).rejects.toThrow(
			`Tag ${tag.uid} is already attached to product unit "Mango 12, 30 mL". End that first: a tag is attached to one thing at a time.`,
		);
		await expect(endAssignment(sql, staff, { tagId: tag.id, reason: "" })).rejects.toThrow(
			"Say why the tag is being taken off.",
		);
		await endAssignment(sql, staff, { tagId: tag.id, reason: "Unit returned and scrapped" });
		await expect(endAssignment(sql, staff, { tagId: tag.id, reason: "Again" })).rejects.toThrow(
			"isn't attached to anything",
		);
		await assign(tag.id, { subjectKind: "location", subjectRef: "Shelf B2", sku: "" });
		const detail = await getTag(sql, tag.id);
		expect(detail?.assignment).toMatchObject({ subjectKind: "location", subjectRef: "Shelf B2", sku: null });
		expect(detail?.history.map((a) => [a.subjectRef, a.endReason, a.endedBy])).toEqual([
			["Mango 12, 30 mL", "Unit returned and scrapped", "operator:staff-1"],
		]);
		await expect(assign(tag.id, { subjectKind: "pallet" })).rejects.toThrow(
			"Choose what the tag is attached to.",
		);
		await expect(
			assignTag(sql, staff, { tagId: tag.id, subjectKind: "location", subjectRef: "" }),
		).rejects.toThrow("Say what it is");
	});

	it("takes a carton's quantity from a named manifest, never from the tag", async () => {
		const [carton, unit, inner] = await uhf(3);
		await expect(
			assign(carton.id, { subjectKind: "carton", subjectRef: "Carton of Mango 12", unitsDeclared: "24" }),
		).rejects.toThrow(
			"Name the manifest or packing list the number of units comes from. It is never read from the tag.",
		);
		await expect(
			assign(carton.id, {
				subjectKind: "carton",
				subjectRef: "Carton",
				unitsDeclared: "a lot",
				unitsSource: "PL-1",
			}),
		).rejects.toThrow("must be a whole number");
		await expect(assign(unit.id, { unitsDeclared: "24", unitsSource: "PL-1" })).rejects.toThrow(
			"Only a carton, case, container or tote holds a number of units.",
		);
		const boxed = await assign(carton.id, {
			subjectKind: "carton",
			subjectRef: "Carton of Mango 12",
			unitsDeclared: "24",
			unitsSource: "Packing list PL-4471",
		});
		expect(boxed).toMatchObject({ unitsDeclared: 24, unitsSource: "Packing list PL-4471" });

		// A unit inside the carton; a carton can't be inside its own unit, or itself.
		const within = await assign(unit.id, { parentUid: carton.uid });
		expect(within).toMatchObject({ parentTagId: carton.id, parentUid: carton.uid });
		await expect(assign(inner.id, { parentUid: unit.uid })).rejects.toThrow(
			"isn't attached to a carton, case, container or tote at the moment, so nothing can be inside it.",
		);
		await expect(assign(inner.id, { parentUid: inner.uid })).rejects.toThrow("A tag can't be inside itself.");
		await expect(assign(inner.id, { parentUid: epc() })).rejects.toThrow("isn't in the registry");
		expect((await getTag(sql, carton.id))?.inside.map((c) => c.tag.uid)).toEqual([unit.uid]);

		// A container with things recorded inside it isn't ended or retired from under them.
		await expect(endAssignment(sql, staff, { tagId: carton.id, reason: "Unpacked" })).rejects.toThrow(
			`Other tags are recorded as inside ${carton.uid}. End those first`,
		);
		await expect(
			setTagStatus(sql, staff, { tagId: carton.id, status: "retired", reason: "Carton recycled" }),
		).rejects.toThrow("End those first.");
		await endAssignment(sql, staff, { tagId: unit.id, reason: "Unpacked" });
		await endAssignment(sql, staff, { tagId: carton.id, reason: "Unpacked" });
	});

	it("nests containers without ever making a loop", async () => {
		const [outer, middle, innermost] = await uhf(3);
		await assign(outer.id, { subjectKind: "tote", subjectRef: "Tote 14", sku: "" });
		await assign(middle.id, { subjectKind: "carton", subjectRef: "Carton A", parentUid: outer.uid });
		await assign(innermost.id, { subjectKind: "case", subjectRef: "Case 1", parentUid: middle.uid });
		expect((await getTag(sql, outer.id))?.inside.map((c) => c.tag.uid)).toEqual([middle.uid]);
		expect((await getTag(sql, innermost.id))?.assignment?.parentUid).toBe(middle.uid);
		// To put the tote inside the case that is inside it, the tote would have to be taken off first, and it can't be
		// while the carton is recorded inside it. So a loop can't be built.
		await expect(
			assign(outer.id, { subjectKind: "tote", subjectRef: "Tote 14", sku: "", parentUid: innermost.uid }),
		).rejects.toThrow("is already attached to tote");
		await expect(endAssignment(sql, staff, { tagId: outer.id, reason: "Re-tagging" })).rejects.toThrow(
			"End those first",
		);
		await expect(endAssignment(sql, staff, { tagId: middle.id, reason: "Re-tagging" })).rejects.toThrow(
			"End those first",
		);
	});

	it("links to the equipment record, which has to exist and has to be equipment", async () => {
		const [tag] = await registerTags(sql, staff, { technology: "nfc", security: "plain", uids: nfc() });
		const scale = await addEquipment(sql, staff, { code: "SC-TAG", name: "Bench scale", kind: "scale" });
		await expect(
			assignTag(sql, staff, {
				tagId: tag.id,
				subjectKind: "location",
				subjectRef: "Bench",
				equipmentId: scale.id,
			}),
		).rejects.toThrow("Choose Equipment as what it is attached to");
		await expect(
			assignTag(sql, staff, {
				tagId: tag.id,
				subjectKind: "equipment",
				subjectRef: "Bench scale",
				equipmentId: "00000000-0000-4000-8000-000000000000",
			}),
		).rejects.toThrow("That equipment doesn't exist.");
		expect(
			await assignTag(sql, staff, {
				tagId: tag.id,
				subjectKind: "equipment",
				subjectRef: "Bench scale SC-TAG",
				equipmentId: scale.id,
			}),
		).toMatchObject({ equipmentId: scale.id });
	});
});

describe("a tag's life", () => {
	it("ends what it was on when it is retired or revoked, and only the owner puts it back", async () => {
		const [tag] = await uhf();
		await assign(tag.id);
		await expect(setTagStatus(sql, staff, { tagId: tag.id, status: "revoked", reason: "" })).rejects.toThrow(
			"Say why.",
		);
		const revoked = await setTagStatus(sql, staff, {
			tagId: tag.id,
			status: "revoked",
			reason: "Two units reported with this identifier",
		});
		expect(revoked).toMatchObject({
			status: "revoked",
			statusReason: "Two units reported with this identifier",
		});
		const detail = await getTag(sql, tag.id);
		expect(detail?.assignment).toBeNull();
		expect(detail?.history[0].endReason).toBe("Tag revoked: Two units reported with this identifier");
		await expect(assign(tag.id)).rejects.toThrow(
			`Tag ${tag.uid} is revoked (Two units reported with this identifier), so it can't be attached to anything.`,
		);
		await expect(
			setTagStatus(sql, staff, { tagId: tag.id, status: "revoked", reason: "Again" }),
		).rejects.toThrow("already revoked");
		await expect(
			setTagStatus(sql, staff, { tagId: tag.id, status: "active", reason: "It was a misread" }),
		).rejects.toThrow("Only the owner can put a retired or revoked tag back in use.");
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "tag.reinstate", outcome: "denied" });
		expect(
			await setTagStatus(sql, owner, { tagId: tag.id, status: "active", reason: "Confirmed a misread" }),
		).toMatchObject({ status: "active", statusReason: null });
		expect((await assign(tag.id)).endedAt).toBeNull();
	});

	it("counts the tags in use that are attached to nothing", async () => {
		const before = await tagCounts(sql);
		const [loose, used, retired] = await uhf(3);
		await assign(used.id);
		await setTagStatus(sql, staff, { tagId: retired.id, status: "retired", reason: "Damaged" });
		const after = await tagCounts(sql);
		expect(after.total - before.total).toBe(3);
		// A retired tag is not waiting to be attached.
		expect(after.unassigned - before.unassigned).toBe(1);
		expect((await listTags(sql, { unassigned: true })).map((r) => r.tag.id)).toContain(loose.id);
		expect((await listTags(sql, { unassigned: true })).map((r) => r.tag.id)).not.toContain(retired.id);
		// Found by what it is on, not only by its identifier.
		expect((await listTags(sql, { q: "MANGO-12" })).map((r) => r.tag.id)).toContain(used.id);
	});
});

describe("a scan", () => {
	it("is an observation of a registered tag, and nothing more", async () => {
		const [tag] = await uhf();
		await assign(tag.id, { serial: "SN-9" });
		const seen = await scan(tag.uid.toLowerCase(), { eventId: "reader-1:000451" });
		expect(seen.recorded).toBe(true);
		expect(seen.event).toMatchObject({
			eventId: "reader-1:000451",
			uid: tag.uid,
			tagId: tag.id,
			station: "Dock reader 1",
			workflow: "receiving",
			source: "simulated",
			exceptionId: null,
			operator: "operator:staff-1",
			observedAt: NOW.toISOString(),
		});
		expect(seen.assignment).toMatchObject({ serial: "SN-9" });
		expect(seen.exception).toBeNull();
		// What it is attached to hasn't changed, and nothing else was written about it.
		expect((await getTag(sql, tag.id))?.assignment?.subjectRef).toBe("Mango 12, 30 mL");
		expect((await listScans(sql, { tagId: tag.id })).map((s) => s.eventId)).toEqual(["reader-1:000451"]);
	});

	it("counts once however often the same read arrives, in whatever order", async () => {
		const [tag] = await uhf();
		const later = new Date("2026-10-21T15:00:09Z");
		const first = await scan(tag.uid, { eventId: "export-7:12", observedAt: "2026-10-21T14:58:03Z" }, later);
		// The export replayed, and an older read arriving after a newer one.
		const again = await scan(tag.uid, { eventId: "export-7:12", observedAt: "2026-10-21T14:58:03Z" }, later);
		const older = await scan(tag.uid, { eventId: "export-7:11", observedAt: "2026-10-21T14:57:00Z" }, later);
		expect(again.recorded).toBe(false);
		expect(again.event.id).toBe(first.event.id);
		expect(older.recorded).toBe(true);
		// Newest read first, by when the tag was read, not by when the line arrived.
		expect((await listScans(sql, { tagId: tag.id })).map((s) => s.eventId)).toEqual([
			"export-7:12",
			"export-7:11",
		]);
		// A read typed in gets an id of its own; a second one a moment later is a second observation.
		const typed = await scan(tag.uid, { source: "manual" }, new Date("2026-10-21T15:01:00Z"));
		const typedAgain = await scan(tag.uid, { source: "manual" }, new Date("2026-10-21T15:01:30Z"));
		expect(typed.event.eventId).not.toBe(typedAgain.event.eventId);
	});

	it("says where it came from and can't be dated ahead", async () => {
		const [tag] = await uhf();
		await expect(scan(tag.uid, { station: "" })).rejects.toThrow("Say where it was read");
		await expect(scan(tag.uid, { workflow: "audit" })).rejects.toThrow("Choose what the scan was for.");
		await expect(scan(tag.uid, { source: "" })).rejects.toThrow("whether it is real or simulated");
		await expect(scan(tag.uid, { observedAt: "soon" })).rejects.toThrow("must be a date and time");
		await expect(scan(tag.uid, { observedAt: "2026-10-22T15:00:00Z" })).rejects.toThrow("is in the future");
		await expect(scan("not hex")).rejects.toThrow("It should be hexadecimal");
		expect(await listScans(sql, { tagId: tag.id })).toEqual([]);
	});

	it("of a tag nobody registered raises one exception, however many times it is read", async () => {
		const stranger = epc();
		const first = await scan(stranger, { eventId: "dock:1" });
		expect(first.tag).toBeNull();
		expect(first.exception).toMatchObject({
			kind: "unknown_tag",
			uid: stranger,
			status: "open",
			seen: 1,
			detail: "Read at Dock reader 1. No tag with this identifier is registered.",
		});
		const second = await scan(stranger, { eventId: "dock:2", station: "Dock reader 2" });
		expect(second.exception).toMatchObject({ id: first.exception?.id, seen: 2 });
		expect((await listExceptions(sql)).filter((e) => e.uid === stranger)).toHaveLength(1);

		await expect(
			resolveException(sql, staff, { exceptionId: first.exception?.id ?? "", resolution: "" }),
		).rejects.toThrow("Say what it turned out to be");
		const resolved = await resolveException(sql, staff, {
			exceptionId: first.exception?.id ?? "",
			resolution: "A supplier's own carton tag. Not ours; nothing to register.",
		});
		expect(resolved).toMatchObject({ status: "resolved" });
		await expect(
			resolveException(sql, staff, { exceptionId: resolved.id, resolution: "Again" }),
		).rejects.toThrow("already been resolved");
		// Read again after that, it is a new exception: the first one stays closed as it was.
		const third = await scan(stranger, { eventId: "dock:3" });
		expect(third.exception?.id).not.toBe(first.exception?.id);
		expect(third.exception?.seen).toBe(1);
	});

	it("of a revoked or retired tag is flagged rather than trusted", async () => {
		const [revoked, retired] = await uhf(2);
		await setTagStatus(sql, staff, { tagId: revoked.id, status: "revoked", reason: "Reported copied" });
		await setTagStatus(sql, staff, { tagId: retired.id, status: "retired", reason: "Unit destroyed" });
		expect((await scan(revoked.uid, { eventId: "gate:1" })).exception).toMatchObject({
			kind: "revoked_seen",
			detail: "Read at Dock reader 1. This tag was revoked: Reported copied",
		});
		expect((await scan(retired.uid, { eventId: "gate:2" })).exception).toMatchObject({
			kind: "retired_seen",
			detail: "Read at Dock reader 1. This tag was retired: Unit destroyed",
		});
		expect((await tagCounts(sql)).openExceptions).toBeGreaterThanOrEqual(2);
	});
});
