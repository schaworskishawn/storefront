import Header from "./Header";
import Hero from "./Hero";
import CategoryGrid from "./CategoryGrid";
import ProductSection from "./ProductSection";
import TrustBadges from "./TrustBadges";
import BrandsCarousel from "./BrandsCarousel";
import { PromoBundles, Newsletter } from "./PromoAndNewsletter";
import Footer from "./Footer";
import { PRODUCTS } from "@/lib/data";

export default function HomePage() {
  return (
    <div className="bg-[#05030a] flex flex-col items-center w-full min-h-screen">
      <Header />
      <Hero />
      <CategoryGrid />

      <ProductSection eyebrow="Collection" title="FEATURED PRODUCTS" products={PRODUCTS} />
      <hr className="border-border-purple w-full" />
      <ProductSection eyebrow="Top Picks" title="BEST SELLERS" products={PRODUCTS} />
      <hr className="border-border-purple w-full" />
      <ProductSection eyebrow="Latest" title="NEW ARRIVALS" products={PRODUCTS} />
      <hr className="border-border-purple w-full" />

      <TrustBadges />
      <BrandsCarousel />
      <PromoBundles />
      <Newsletter />
      <Footer />
    </div>
  );
}
