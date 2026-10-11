---
name: catalog-product-master
description: "Validate a product brief against its verified specifications and assemble the text outputs selected: descriptions, bullets, alt text and search drafts. Use it to prepare a product content package."
---

# Catalog product master

## Use this when

- A product needs its content package drafted from verified specifications.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Product (required)
- SKU (required)
- Variants covered
- Outputs wanted (required)
- Verified specifications (required)
- Images (for alt text)

## Procedure

1. Read the product, SKU and verified specifications.
2. Check the brief against the specifications and report mismatches.
3. Draft each selected output from the specifications only.
4. Give each output its own status: drafted, or not drafted with the reason.
5. State plainly that no image was produced.

## What you produce

- A stored ProductContentPackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every specification in the copy matches the verified one.
- Formula, batch, packaging run and SKU are never merged.
- No output claims an image exists.

## When something goes wrong

- If the brief contradicts a specification, the specification stands and the mismatch is listed.

## Example

**Request:** "Catalog: build product content package."

**Result:** A product content package draft is stored against the product and SKU with each selected output, the specifications each statement rests on, a status per output, and the specifications still missing.

## Limits

- It drafts text from supplied specifications. It generates no image (no image tool is connected), invents no specification, and publishes nothing to the store.
- Assembles drafts. Never publishes a product, replaces live media or changes stock or prices.
- Text only. No image tool is connected, and nothing is written to Saleor.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
