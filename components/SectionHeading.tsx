export default function SectionHeading({
  eyebrow,
  title,
  underlineWidth = 80,
}: {
  eyebrow: string;
  title: string;
  underlineWidth?: number;
}) {
  return (
    <div className="flex flex-col gap-[8px] items-center mb-[24px]">
      <p className="font-marker text-[color:#f179fb] text-[23px] tracking-[2px] uppercase">
        {eyebrow}
      </p>
      <h2 className="font-display text-white text-[32px] tracking-[1px] text-center">{title}</h2>
      <div
        className="bg-border-accent h-[3px] rounded-full"
        style={{ width: `${underlineWidth}px` }}
      />
    </div>
  );
}
