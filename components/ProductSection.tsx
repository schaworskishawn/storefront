import { Product } from "@/lib/types";
import ProductCard from "./ProductCard";
import SectionHeading from "./SectionHeading";
import Button from "./Button";

export default function ProductSection({
  eyebrow,
  title,
  products,
}: {
  eyebrow: string;
  title: string;
  products: Product[];
}) {
  return (
    <section className="flex flex-col gap-[32px] items-center py-[24px] px-[16px] md:gap-[40px] md:px-[32px] lg:gap-[48px] lg:py-[27px] lg:px-[80px] w-full">
      <SectionHeading eyebrow={eyebrow} title={title} underlineWidth={80} />
      <div className="grid grid-cols-2 gap-[12px] w-full max-w-[704px] md:gap-[16px] lg:grid-cols-4 lg:gap-[26px] lg:max-w-[1288px]">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      <Button variant="outline-cyan">VIEW ALL</Button>
    </section>
  );
}
