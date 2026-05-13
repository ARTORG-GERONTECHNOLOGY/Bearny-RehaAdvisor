import { Skeleton } from '@/components/ui/skeleton';
import Container from '../Container';

export default function FallbackSkeleton() {
  return (
    <div className="min-h-screen bg-back">
      <Container className="pt-16 md:pt-28 transition-all">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-64 mt-2" />

        <div className="mt-16 space-y-3 md:w-1/2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </Container>
    </div>
  );
}
