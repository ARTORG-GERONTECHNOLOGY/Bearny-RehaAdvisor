import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientInterventionDetailSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-3">
        {/* Back Button */}
        <Skeleton className="h-14 w-14 rounded-full" />
        {/* Content */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start">
          {/* Title */}
          <Skeleton className="h-56 w-full rounded-[40px]" />
          {/* Content */}
          <Skeleton className="h-56 w-full rounded-[40px]" />
        </div>
      </div>
    </Layout>
  );
}
