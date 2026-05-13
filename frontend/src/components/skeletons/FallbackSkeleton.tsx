import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function FallbackSkeleton() {
  return (
    <Layout>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-8 w-64 mt-2" />

      <div className="mt-16 space-y-3 md:w-1/2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    </Layout>
  );
}
