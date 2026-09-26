// These shapes intentionally mirror what you'll get back from Saleor's
// GraphQL API (Product, ProductVariant, pricing) so swapping the static
// arrays in `data.ts` for a `saleorClient.query(...)` call is a drop-in
// change per component.

export interface Product {
  id: string;
  slug: string;
  brand: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  badge?: string;
  image: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  image: string;
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
}

export interface TrustItem {
  icon: string;
  title: string;
  subtitle: string;
}
