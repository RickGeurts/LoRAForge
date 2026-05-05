export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-800">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
          {description}
        </p>
      ) : null}
    </header>
  );
}
