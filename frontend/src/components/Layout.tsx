import Navigation from '@/components/Navigation';
import Container from '@/components/Container';

type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

// TODO: move colors to config as soon as they are fixed
export default function Layout({ title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen bg-[#ECECEC]">
      <Navigation />
      <Container
        className="
          pt-16 md:pt-28 pb-28
          transition-all
        "
      >
        {title && <h1 className="text-2xl font-bold text-zinc-800 p-0 m-0">{title}</h1>}
        {subtitle && <h2 className="text-lg font-medium text-zinc-600 p-0 m-0">{subtitle}</h2>}
        {children}
      </Container>
    </div>
  );
}
