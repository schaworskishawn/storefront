---
name: deterministic-calculation-check
description: "Do every calculation in application code with exact decimals, a stated method and stated rounding, and never in a model's head. Use it for any result containing money, quantities, rates, dates or unit conversions."
---

# Deterministic calculation check

## Use this when

- A result contains a sum, a difference, a rate, a tax or duty, a date window or a unit conversion.
- Figures have to be reproducible by someone checking them later.

## Do not use this when

- A conversion constant (a density, an exchange rate, a tax rate) has not been supplied or approved: the figure is unavailable, not estimated.

## What you need

- The validated figures, each with its unit and currency.
- The approved rule or documented constant that applies, with its effective dates.

## Procedure

1. Confirm every operand has a unit and, for money, a currency. Never add across currencies or units.
2. Use the registered exact-decimal functions. Binary floating-point arithmetic is not used for any stored figure.
3. Apply the rounding the rule states, at the point the rule states it (per line or on the total).
4. Keep the method beside the result: the rule, its version, the rounding and the inputs.
5. Where a needed constant is missing, leave that figure unavailable and say which constant is missing.

## What you produce

- Exact figures as decimal text.
- The method, rule version and rounding used.
- A list of figures that could not be calculated and why.

## Checks before you finish

- Totals equal the sum of their lines to the last decimal place shown.
- No figure was produced by a model. A drafted result's figures must all appear in the supplied or calculated data.
- A volume is never turned into a weight, or the reverse, without a documented density.

## When something goes wrong

- If two rules overlap or none is in effect, the line is left unresolved rather than given a zero or a guess.
- If inputs fail validation, nothing is calculated.

## Example

**Request:** "What does 120 mL of nicotine base weigh?" with a documented density of 1.035 g/mL.

**Result:** 124.20 g, calculated as 120 x 1.035, rounded to two places. Without the density the weight is unavailable.

## Limits

- It calculates from what it is given. It cannot tell whether a supplied rate or density is the right one.
