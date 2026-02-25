import Navigation from '@/components/Navigation';

type Props = {
  children: React.ReactNode;
};

// TODO: move colors to config as soon as they are fixed
export default function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-[#ECECEC]">
      <Navigation />
      <main
        className="
          pb-28
          md:pt-28 md:pb-0
          transition-all
        "
      >
        {children}
      </main>
    </div>
  );
}
