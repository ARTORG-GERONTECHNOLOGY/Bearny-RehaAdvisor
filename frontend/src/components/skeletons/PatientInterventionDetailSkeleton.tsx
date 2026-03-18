import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientInterventionDetailSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex justify-between">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-14 w-36 rounded-full" />
        </div>
        {/* Title */}
        <Skeleton className="h-56 w-full rounded-[40px]" />
        {/* Content */}
        <Skeleton className="h-56 w-full rounded-[40px]" />
        {/* Tags */}
        <Skeleton className="h-56 w-full rounded-[40px]" />
      </div>
    </Layout>
  );
}
