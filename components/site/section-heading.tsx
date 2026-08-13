/**
 * ترويسة قسم موحّدة: شارة صغيرة + عنوان + وصف اختياري — تحافظ على إيقاع بصري ثابت.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
      <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
        {eyebrow}
      </span>
      <h2 className="text-balance text-3xl font-bold leading-snug tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-pretty leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </div>
  );
}
