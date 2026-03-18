import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientPlanSkeleton() {
  return (
    <Layout>
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-48 mb-1" />
        <Skeleton className="h-6 w-32" />
      </div>

      {/* Day Filter Badges */}
      <div className="mt-8 flex gap-1 no-scrollbar overflow-y-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>

      {/* Day Cards */}
      <div className="flex flex-col gap-2 mt-6 md:grid md:grid-cols-2">
        {Array.from({ length: 7 }).map((_, dayIndex) => (
          <div key={dayIndex} className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
            {/* Date Header */}
            <div className="flex p-2 pl-4 justify-between w-full">
              <Skeleton className="h-6 w-48" />
              {dayIndex === 0 && <Skeleton className="h-6 w-16 rounded-full" />}
            </div>

            {/* Intervention Items */}
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex border border-accent rounded-3xl p-4 gap-3">
                <div className="flex gap-3 w-full items-center">
                  <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                  <Skeleton className="h-5 flex-1" />
                </div>
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Layout>
  );
}
