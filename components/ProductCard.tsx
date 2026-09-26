import Image from "next/image";
import Link from "next/link";
import { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <div className="bg-bg-section border border-text-accent-bright rounded-[13px] overflow-hidden flex flex-col w-full h-full">
      <div className="relative h-[130px] w-full flex items-center justify-center md:h-[194px]">
        <Image src={product.image} alt={product.name} fill className="object-cover" />
        {product.badge && (
          <span className="absolute top-[8px] left-[8px] bg-border-highlight border border-border-highlight rounded-full px-[8px] py-[4px] text-[8px] font-extrabold text-border-highlight md:top-[10px] md:left-[10px] md:px-[10px] md:py-[6px] md:text-[10px]">
            {product.badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-[4px] p-[12px] md:gap-[6px] md:p-[15px]">
        <p className="font-display text-[9px] text-text-accent-bright md:text-[10px]">{product.brand}</p>
        <Link
          href={`/products/${product.slug}`}
          className="font-comic text-[12px] text-white hover:text-border-accent transition-colors truncate md:text-[15px]"
        >
          {product.name}
        </Link>
        <p className="font-mono text-[9px] text-text-muted truncate md:text-[11px]">{product.description}</p>
        <div className="flex items-center justify-between pt-[4px] md:pt-[6px]">
          <div className="flex flex-col font-display gap-[2px]">
            <span className="text-[13px] text-white md:text-[17px]">${product.price.toFixed(2)}</span>
            {product.compareAtPrice && (
              <span className="text-[9px] text-text-muted line-through md:text-[11px]">
                ${product.compareAtPrice.toFixed(2)}
              </span>
            )}
          </div>
          {/* Figma's node has text-accent-bright text on a text-accent-bright
              fill (invisible). Using the dark control bg for contrast instead --
              revisit against the live design if that wasn't intentional. */}
          <button className="bg-text-accent-bright border border-text-accent-bright rounded-[6px] px-[8px] py-[6px] font-comic text-[8px] text-control-bg-default hover:opacity-90 transition-opacity whitespace-nowrap md:rounded-[9px] md:px-[11px] md:py-[11px] md:text-[10px]">
            <span className="md:hidden">+ CART</span>
            <span className="hidden md:inline">ADD TO CART</span>
          </button>
        </div>
      </div>
    </div>
  );
}
