import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientSkeleton() {
  return (
    <Layout>
      {/* Header */}
      <div>
        <Skeleton className="h-9 w-32 mb-1" />
        <Skeleton className="h-6 w-40" />
      </div>

      {/* Main content */}
      <div className="mt-28 flex flex-col gap-2">
        <Skeleton className="h-[182px] w-full rounded-[40px]" />
        <Skeleton className="h-[500px] w-full rounded-[40px]" />
        <Skeleton className="h-[300px] w-full rounded-[40px]" />
      </div>
    </Layout>
  );
}
