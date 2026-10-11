---
name: stock-inventory-planning
description: "Work out usable stock per SKU from a stock snapshot, net of holds, expired lots and reservations, and the quantity short of covering demand. Use it to plan replenishment."
---

# Stock inventory planning

## Use this when

- A stock snapshot needs turning into usable quantities and shortages.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Snapshot name (required)
- Snapshot date
- Days to cover beyond the lead time
- Stock lines (one per SKU or per lot) (required)

## Procedure

1. Read the snapshot by SKU and lot, with holds, expiry and reservations.
2. Subtract held, expired and reserved quantities to get usable stock.
3. Compare usable stock with the demand supplied for the lead time.
4. Give the shortage per SKU as an exact quantity.
5. Leave a SKU with no demand figure unplanned.

## What you produce

- A stored ReplenishmentPlan record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Expired and held lots are never counted as usable.
- A SKU with no demand figure gets no guess.
- No stock is deducted and no order is placed.

## When something goes wrong

- If a lot has no expiry where one is required, it is reported, not assumed good.

## Example

**Request:** "Stock: calculate replenishment needs."

**Result:** A replenishment plan is stored with usable quantity, days of cover, target and shortage per SKU, with held and expired stock shown separately and every SKU that couldn't be calculated.

## Limits

- It recommends. It does not adjust stock, confirm a reservation or place an order, and a SKU with no demand or lead time is not guessed at.
- Recommends quantities. Never adjusts stock, confirms a reservation or buys anything.
- Works from a snapshot you supply. No inventory ledger is stored yet.
- The figures and findings are calculated by code from what is supplied. No model writes them.
