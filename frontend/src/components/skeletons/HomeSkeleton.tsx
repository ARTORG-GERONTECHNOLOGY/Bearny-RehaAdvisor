import { Skeleton } from '@/components/ui/skeleton';
import Container from '@/components/Container';

export default function HomeSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-back">
      <main className="flex-1 flex items-center py-8">
        <Container>
          <div className="flex flex-col gap-3 text-center items-center md:text-start md:items-start w-full md:w-1/2">
            {/* h1 headline */}
            <Skeleton className="h-10 w-3/4" />
            {/* h2 subheadline */}
            <Skeleton className="h-6 w-2/3" />
            {/* body copy */}
            <Skeleton className="h-5 w-full" />
            {/* Login button */}
            <Skeleton className="h-10 w-36 mt-2" />
            {/* Register link */}
            <Skeleton className="h-4 w-48" />
          </div>
        </Container>
      </main>

      <div className="flex items-center justify-center px-4 py-3 border-t bg-white">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
