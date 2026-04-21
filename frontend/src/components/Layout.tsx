import Navigation from '@/components/Navigation';
import Container from '@/components/Container';

type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-[#ECECEC]">
      <Navigation />
      <Container
        className="
          pt-16 md:pt-28 pb-28
          transition-all
        "
      >
        {children}
      </Container>
    </div>
  );
}
