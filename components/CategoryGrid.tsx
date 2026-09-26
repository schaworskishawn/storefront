import Image from "next/image";
import Link from "next/link";
import { CATEGORIES } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function CategoryGrid() {
  return (
    <section className="flex flex-col items-center pb-[32px] pt-[17px] px-[16px] md:px-[32px] lg:px-[68px] w-full">
      <SectionHeading eyebrow="Browse Collections" title="CATEGORIES" underlineWidth={57} />
      <div className="grid grid-cols-3 gap-[12px] w-full max-w-[704px] md:gap-[16px] lg:flex lg:gap-[40px] lg:max-w-none lg:justify-center">
        {CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={`/shop?category=${category.slug}`}
            className="relative aspect-square overflow-hidden rounded-[8px] group lg:h-[150px] lg:w-[140px] lg:aspect-auto"
          >
            <Image
              src={category.image}
              alt={category.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
