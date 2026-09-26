import { Product, Category, Brand, TrustItem } from "./types";

// The 8 products in the design repeat visually across all three homepage
// rails (Featured / Best Sellers / New Arrivals) with the same placeholder
// copy and pricing -- that's a Figma placeholder pattern, not real catalog
// data. Replace `PRODUCTS` with a Saleor `products` query per section once
// you're wired up (e.g. filter by collection: "featured" / "best-sellers" /
// "new-arrivals").
export const PRODUCTS: Product[] = [
  {
    id: "1",
    slug: "frizzy-cherry-lime-60k",
    brand: "FLAVOUR BEAST",
    name: "Frizzy Cherry Lime 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-1.png",
  },
  {
    id: "2",
    slug: "juicy-peach-60k",
    brand: "FLAVOUR BEAST",
    name: "Juicy Peach 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-2.png",
  },
  {
    id: "3",
    slug: "s-blue-razz-60k",
    brand: "FLAVOUR BEAST",
    name: "S Blue Razz 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-3.png",
  },
  {
    id: "4",
    slug: "watermelon-ice-60k",
    brand: "FLAVOUR BEAST",
    name: "Watermelon Ice 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-4.png",
  },
  {
    id: "5",
    slug: "grape-burst-60k",
    brand: "FLAVOUR BEAST",
    name: "Grape Burst 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-5.png",
  },
  {
    id: "6",
    slug: "mango-tango-60k",
    brand: "FLAVOUR BEAST",
    name: "Mango Tango 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-6.png",
  },
  {
    id: "7",
    slug: "cool-mint-60k",
    brand: "FLAVOUR BEAST",
    name: "Cool Mint 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-7.png",
  },
  {
    id: "8",
    slug: "tropical-fusion-60k",
    brand: "FLAVOUR BEAST",
    name: "Tropical Fusion 60K",
    description: "High-capacity disposable device.",
    price: 34.99,
    compareAtPrice: 47.99,
    badge: "BEST SELLER",
    image: "/images/products/product-8.png",
  },
];

// Names are baked into the artwork itself (no separate text layer in
// Figma), read off the rendered tiles. Update slugs to match your real
// Saleor category tree once it exists.
export const CATEGORIES: Category[] = [
  { id: "1", slug: "disposables", name: "Disposables", image: "/images/categories/category-1.png" },
  { id: "2", slug: "e-liquid", name: "E-Liquid", image: "/images/categories/category-2.png" },
  { id: "3", slug: "hardware", name: "Hardware", image: "/images/categories/category-3.png" },
  { id: "4", slug: "coils", name: "Coils", image: "/images/categories/category-4.png" },
  { id: "5", slug: "accessories", name: "Accessories", image: "/images/categories/category-5.png" },
  { id: "6", slug: "new-arrivals", name: "New Arrivals", image: "/images/categories/category-6.png" },
];

export const BRANDS: Brand[] = [
  { id: "flavour-beast", name: "Flavour Beast", logo: "/images/brands/flavour-beast.png" },
  { id: "stlth", name: "STLTH", logo: "/images/brands/stlth.png" },
  { id: "vaporesso", name: "Vaporesso", logo: "/images/brands/vaporesso.png" },
  { id: "smok", name: "SMOK", logo: "/images/brands/smok.png" },
  { id: "uwell", name: "Uwell", logo: "/images/brands/uwell.png" },
  { id: "geekvape", name: "GeekVape", logo: "/images/brands/geekvape.png" },
];

export const TRUST_ITEMS: TrustItem[] = [
  { icon: "⚡", title: "24/7 SUPPORT", subtitle: "Always active direct line" },
  { icon: "🍁", title: "GLOBAL SHIPPING", subtitle: "Coming Soon, Canada Only" },
  { icon: "🔞", title: "AGE VERIFIED CHECKOUT", subtitle: "Must Be Of Legal Age" },
  { icon: "📦", title: "WE SHIP PACKAGES ASAP", subtitle: "No Delay standard logistics" },
];

export const NAV_LINKS = ["Home", "Shop", "Payments", "Shipping", "Blog"];

export const FOOTER_COLUMNS = [
  {
    title: "SHOP",
    links: ["All Products", "Disposables", "E-Liquids", "Devices", "Coils", "Accessories"],
  },
  {
    title: "COMPANY",
    links: ["About Us", "Shipping Info", "Payments", "Blog", "Affiliate Program", "Sponsor Us"],
  },
  {
    title: "HELP",
    links: ["FAQs", "Age Verification", "Terms & Conditions", "Privacy Policy", "Returns", "Contact Us"],
  },
];
