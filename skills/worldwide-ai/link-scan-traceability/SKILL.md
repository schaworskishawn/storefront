---
name: link-scan-traceability
description: "Reconcile one session's tag reads against its manifest: repeated reads count once, a carton and its units are never both counted, and unknown tags become exceptions. Use it to reconcile a scan session."
---

# Link scan traceability

## Use this when

- A scan session's reads need reconciling against a manifest.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Session (required)
- Session type (required)
- Where the scans came from (required)
- Manifest (expected tags) (required)
- Scan events (required)

## Procedure

1. Read the tag reads and the manifest.
2. Count each tag once, however many times it was read.
3. Where a carton and its units were both read, count the units once.
4. List expected tags that weren't read, and read tags that weren't expected.
5. Give the totals.

## What you produce

- A stored ScanReconciliation record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A repeated read is one item.
- A carton and its contents are never double counted.
- A tag id proves nothing about age, identity or authenticity.

## When something goes wrong

- If a tag isn't on the manifest, it is an exception, not a match.

## Example

**Request:** "Link: reconcile scan session."

**Result:** A scan reconciliation is stored with expected and observed units per SKU, missing tags, unknown tags, how cartons were counted, and the number of repeated reads that were collapsed.

## Limits

- A read is an observation. No stock is moved, no location is inferred from a nearby read, and reading a tag proves nothing about authenticity, identity or age.
- Cannot grant access, decide legal age, approve its own adjustments, certify safety or declare a recall.
- Works from scan exports you supply. No reader is connected and there is no tag registry yet.
- The figures and findings are calculated by code from what is supplied. No model writes them.
