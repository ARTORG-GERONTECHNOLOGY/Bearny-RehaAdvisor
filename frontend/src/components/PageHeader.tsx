type Props = {
  title?: string;
  subtitle?: string;
};

export default function PageHeader({ title, subtitle }: Props) {
  if (!title && !subtitle) return null;

  return (
    <div>
      {title && <h1 className="text-2xl font-bold text-zinc-800 p-0 m-0">{title}</h1>}
      {subtitle && <h2 className="text-lg font-medium text-zinc-600 p-0 m-0">{subtitle}</h2>}
    </div>
  );
}
