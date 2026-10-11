---
name: check-data-quality
description: "Run completeness, duplicate, format and unit checks over supplied records and list every problem by row, with the original value and a proposed correction. Use it before records are relied on or imported."
---

# Check data quality

## Use this when

- A set of records needs checking before it is used, imported or reported on.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Dataset name (required)
- Key column (required)
- Columns that must be filled in
- Columns that must be numbers
- Columns that must be dates (YYYY-MM-DD)
- Unit column
- Units allowed in that column
- Records (required)

## Procedure

1. Confirm the key column and the required columns exist before reading any row.
2. Check each row for missing required values, wrong formats and inconsistent units.
3. Find duplicate keys, and tell identical duplicates from ones that conflict.
4. For each problem, record the row, the key, the original value and a proposed correction.
5. Report a clean dataset as clean, with the number of rows read.

## What you produce

- A stored DataQualityReport record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every problem carries its row and its original value.
- A proposed correction is a proposal: nothing is edited, merged or deleted.
- The count of rows read is shown.

## When something goes wrong

- If a required column is missing, stop and name it rather than checking the rest.

## Example

**Request:** "Check: validate selected records."

**Result:** A data quality report is stored listing each rule that was run, how many rows it checked and failed, and every problem by row and record key. No record is edited.

## Limits

- It reports and proposes. It does not edit, merge or delete any record, and it checks only the rows you supplied.
- Reports problems and proposes corrections. Never edits, merges or deletes records.
- The figures and findings are calculated by code from what is supplied. No model writes them.
