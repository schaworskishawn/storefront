---
name: source-purchasing-analysis
description: "Compare supplier quotes on exact landed cost for the quantity needed, in one currency, using only the costs each quote states. Use it to prepare a quote comparison for review."
---

# Source purchasing analysis

## Use this when

- Several supplier quotes need comparing for a quantity.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Item (required)
- Quantity needed (required)
- Compare in (required)
- Quotes (required)

## Procedure

1. Read each quote's unit price, minimum order, shipping, duty and exchange rate.
2. Calculate the landed cost for the quantity, honouring the minimum order.
3. Convert to one currency using the rate on the quote.
4. Rank only quotes with every cost present.
5. List quotes that can't be ranked and what each is missing.

## What you produce

- A stored QuoteComparison record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A quote with a missing cost is never ranked.
- Exchange rates come from the quote, not from memory.
- No purchase order is placed.

## When something goes wrong

- If no quote is complete, there is no ranking and the result says so.

## Example

**Request:** "Source: compare purchasing quotes."

**Result:** A quote comparison is stored with each quote's landed total and per-unit cost in one currency, lead times, what each quote is missing, a ranking, and a draft purchase order for review.

## Limits

- A quote with a missing cost is shown as incomplete, not ranked on a guess. Supplier quality is Qualify's call. No order is submitted.
- Compares and drafts. Never submits a purchase order or commits spend.
- The figures and findings are calculated by code from what is supplied. No model writes them.
