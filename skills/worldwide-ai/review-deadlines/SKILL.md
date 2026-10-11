---
name: review-deadlines
description: "Work out which documents, licences and contracts are overdue, due soon or upcoming on the Winnipeg calendar, keeping confirmed deadlines apart from suggested review dates. Use it to build a deadline register."
---

# Review deadlines

## Use this when

- Dated obligations need sorting into what is overdue and what is coming.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- As of
- Warn this many days ahead
- Dated items (required)

## Procedure

1. Read each item with its date, its kind and whether the date is confirmed or suggested.
2. Calculate days to each date from today in Winnipeg, in code.
3. Sort into overdue, due soon, upcoming and no date.
4. Remove repeats of the same item so one obligation gives one line.
5. Show the owner of each item where one was supplied.

## What you produce

- A stored DeadlineRegister record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Confirmed deadlines and suggested review dates are listed separately.
- Day counts are calculated, not estimated.
- An item with no date is listed as having no date.

## When something goes wrong

- If a date can't be read, the item is reported with its original text.

## Example

**Request:** "Review: review upcoming deadlines."

**Result:** A deadline register is stored with each item's date, whether that date is confirmed or only suggested, the days remaining, and one follow-up per item that needs attention.

## Limits

- It never invents an obligation: an item with no date stays 'no date', and a date with no source is marked as unsourced.
- Tracks sourced dates. Does not create an obligation that no record supports.
- The figures and findings are calculated by code from what is supplied. No model writes them.
