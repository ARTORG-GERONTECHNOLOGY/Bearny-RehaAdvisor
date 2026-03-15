import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientProcessSkeleton() {
  return (
    <Layout>
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-48 mb-1" />
        <Skeleton className="h-6 w-32" />
      </div>

      {/* Day Filter Badges */}
      <div className="mt-8 flex gap-1 no-scrollbar overflow-y-auto">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>

      {/* Day Cards */}
      <div className="flex flex-col gap-2 mt-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-full rounded-[40px]" />
        ))}
      </div>
    </Layout>
  );
}
