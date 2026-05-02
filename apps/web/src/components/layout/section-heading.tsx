export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">{eyebrow}</p>
      <h2 className="font-serif text-3xl tracking-tight text-stone-950 md:text-4xl">{title}</h2>
      <p className="text-base leading-7 text-stone-700">{description}</p>
    </div>
  )
}
