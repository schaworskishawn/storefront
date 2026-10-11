---
name: structured-extraction
description: "Read pasted tables, lists and records into validated, typed rows, keeping every original value and the row it came from, and flagging what is uncertain. Use it whenever a function's input is a table or a list of records."
---

# Structured extraction

## Use this when

- Input arrives as CSV, tab-separated text, JSON rows or a pasted list.
- Column names vary between exports and have to be matched to the expected fields.

## Do not use this when

- The file's format can't be read as text (a scan, a photo of a document): ask for the data as text.
- The table contains formulas or macros: they are treated as text and never run.

## What you need

- The pasted table or list.
- The fields the function expects, with their types and units.

## Procedure

1. Detect the delimiter and the header row, and match each header to an expected field by its known names.
2. Read each cell as its declared type: exact decimal, whole number, ISO date, or text. Do not coerce a value that doesn't fit.
3. Keep the original value and the row number for anything that fails, and report it by row.
4. Refuse a table over the row limit rather than reading part of it silently.
5. Report how many rows were read, so the reader knows what the result covers.

## What you produce

- Typed rows.
- Row-level problems with the original value.
- The count of rows read.

## Checks before you finish

- A required column that is missing is reported by name before any row is processed.
- No value is changed to make it fit: a bad cell is a reported problem.
- Units are taken from the data or the form, never assumed.

## When something goes wrong

- If the header can't be matched, name the columns found and the columns expected.
- If rows fail, the function reports them and creates nothing, so a partial table is never analysed as if whole.

## Example

**Request:** A stock export with headers "Item code, Qty on hand, Exp." and one row whose quantity is "12 boxes".

**Result:** Headers matched to SKU, on hand and expiry. Row 7 reported: "12 boxes" is not a number. Nothing is calculated until it is corrected.

## Limits

- Text only. Extraction approves nothing and posts nothing: it produces rows for a function to work on.
