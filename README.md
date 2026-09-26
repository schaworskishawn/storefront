# Worldwide Vapor — Home page (Figma → TSX)

Generated from the Figma file `Worldwide Vapor (Copy)`, node `homeHighFidelity`
(`2428:795`), using Figma Dev Mode's design context. Next.js 14 (App Router) +
TypeScript + Tailwind, structured as reusable components so it can be wired
to Saleor and deployed on Vercel.

## 1. Install

```bash
npm install
```

## 2. Pull the design assets

The generated components reference local image paths (`/images/...`), but
the actual files live on Figma's temporary asset CDN, which **this sandbox
can't reach** — those URLs are signed and only valid for ~7 days from when
this project was generated. Run the download script from your own machine:

```bash
npm run assets
# or directly: bash scripts/download-assets.sh
```

This pulls all 36 images/icons into `public/images/`. If the URLs have
expired, re-run the Figma MCP export (`get_design_context` on node
`2428:795`) and swap the new URLs into `scripts/download-assets.sh`.

## 3. Run locally

```bash
npm run dev
```

## 4. Wire up to Saleor

Every component that renders content (`ProductCard`, `ProductSection`,
`CategoryGrid`, `BrandsCarousel`) reads from `lib/data.ts`, which is typed
to match Saleor's GraphQL shapes (see `lib/types.ts`). To connect:

1. Fork/clone Saleor's own storefront (`saleor/storefront`) for its GraphQL
   client setup and `SALEOR_API_URL` env var pattern, **or** add a GraphQL
   client (`urql`/`@apollo/client`/`graphql-request`) to this project directly.
2. Replace the static arrays in `lib/data.ts` with real queries, e.g.:
   - `PRODUCTS` in the "Featured" section → products from a `featured`
     collection
   - `PRODUCTS` in "Best Sellers" → a `best-sellers` collection
   - `PRODUCTS` in "New Arrivals" → products sorted by `-created`
   - `CATEGORIES` → your Saleor category tree (also add real names — the
     Figma design only had category art, no label text)
3. Point `ADD TO CART` (`ProductCard.tsx`) at Saleor's checkout mutations.

## 5. Push to GitHub → deploy on Vercel

```bash
git init
git add .
git commit -m "Home page from Figma"
gh repo create worldwide-vapor-storefront --private --source=. --push
```

Then in Vercel: **Import Git Repository** → select this repo → add your
Saleor env vars (`SALEOR_API_URL`, channel slug, etc.) → Deploy. Every push
to `main` auto-deploys; PRs get preview URLs.

## Notes on fidelity

- **Fonts**: the design uses Bungee, Permanent Marker, and Orbitron (all on
  Google Fonts — wire up via `next/font/google` in `app/layout.tsx`) plus a
  custom "Hey Comic" face that isn't a public font; you'll need to source
  its files from whoever built the Figma file and add an `@font-face` rule.
- **Category labels**: the 6 category tiles in Figma are pure imagery with
  no separate text layer, but the names are baked into the artwork
  (Disposables, E-Liquid, Hardware, Coils, Accessories, New Arrivals) —
  `lib/data.ts` now uses those. Update the slugs once you have real Saleor
  category paths.
- **Product data**: all 24 product cards in the design (3 rows × 8) use the
  same 8 placeholder products/prices — that's a Figma content-fill pattern,
  not real catalog data. This project reuses one `PRODUCTS` array across all
  three sections; split it once you're pulling from Saleor collections.
- **Add to Cart button**: the Figma node has identical text and fill colors
  (invisible text) — rendered here with dark text on the cyan fill instead.
  Double-check against the live file in case that wasn't intentional.
