---
name: duty-excise-reconciliation
description: "Calculate vaping duty on a period's packaged containers from the approved, effective-dated duty tiers supplied, and reconcile the stamp ledger. Use it to prepare an excise workpaper for review."
---

# Duty excise reconciliation

## Use this when

- A period's packaged containers need duty calculated and stamps reconciled.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Jurisdiction (required)
- Period (YYYY-MM) (required)
- Currency (required)
- Approved duty tiers (required)
- Production and packaging events (required)
- Stamp ledger

## Procedure

1. Read the containers packaged, by volume and jurisdiction, and the duty tiers with their effective dates.
2. Apply the tier in effect for each container, rounding part units up only where the rule says so.
3. Total the duty exactly.
4. Reconcile stamps received, applied, damaged and on hand.
5. Leave containers no tier covers unresolved.

## What you produce

- A stored ExciseWorkpaper record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- No rate is invented or carried over from memory.
- The stamp count reconciles, or the difference is shown.
- Nothing is filed, paid or ordered.

## When something goes wrong

- If no tier covers a container, the line is unresolved and listed first.

## Example

**Request:** "Duty: reconcile excise and stamps."

**Result:** An excise workpaper is stored with the duty on each packaging event and the rule version used, total liability, a stamp reconciliation, and every exception.

## Limits

- No duty rate is built in: a container no supplied rule covers leaves the liability unresolved, never zero. Nothing is filed or paid, and no stamp is ordered or disposed of.
- No filing, payment, stamp ordering or stamp disposal. Ledger keeps the books; Tally keeps wider tax.
- The figures and findings are calculated by code from what is supplied. No model writes them.
