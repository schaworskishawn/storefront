---
name: tally-tax-preparation
description: "Apply the approved, effective-dated tax rules you supply to a period's reviewed lines and calculate tax line by line. Use it to prepare a reproducible tax workpaper for review."
---

# Tally tax preparation

## Use this when

- A period's reviewed sales or purchase lines need tax calculated under supplied rules.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Entity (required)
- Period (YYYY-MM) (required)
- Currency (required)
- Approved tax rules (required)
- Reviewed lines (required)

## Procedure

1. Read the lines and the rules, each rule with its jurisdiction, rate and effective dates.
2. For each line, find the rule in effect on the line's date for its jurisdiction.
3. Calculate the tax in exact decimals and round as the rule states, per line.
4. Leave a line unresolved when no rule is in effect or two rules overlap.
5. Total by jurisdiction and list the unresolved lines first.

## What you produce

- A stored TaxWorkpaper record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A missing rule is never treated as a rate of zero.
- Each line shows the rule and version that produced its figure.
- Nothing is filed and nothing is paid.

## When something goes wrong

- If rules overlap for a line, show both and leave the line unresolved.

## Example

**Request:** "Tally: prepare tax workpaper."

**Result:** A tax workpaper is stored with each line's tax, the rule and version used, totals per tax, the difference from tax collected, and every line no rule covers.

## Limits

- No rate is ever assumed: a line with no rule in effect stays unresolved, not zero. Nothing is filed or paid. Vaping excise belongs to Duty.
- Prepares workpapers. Never guesses a rate, files a return or makes a payment. Excise belongs to Duty.
- The figures and findings are calculated by code from what is supplied. No model writes them.
