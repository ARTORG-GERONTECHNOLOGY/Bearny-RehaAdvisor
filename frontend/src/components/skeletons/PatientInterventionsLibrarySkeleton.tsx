import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientInterventionsLibrarySkeleton() {
  return (
    <Layout>
      {/* Title */}
      <Skeleton className="h-8 w-32 mb-4" />

      {/* Search and filter bar */}
      <div className="flex gap-2 mt-14 mb-6 mx-4">
        <Skeleton className="flex-1 h-14 rounded-full" />
        <Skeleton className="h-14 w-14 rounded-full" />
      </div>

      {/* Type sections */}
      <div className="mt-16 flex flex-col gap-4">
        {[1, 2, 3].map((section) => (
          <div key={section} className="flex flex-col gap-2 rounded-[40px] bg-white p-4">
            {/* Section header */}
            <div className="p-2 pl-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-8 w-36 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>

            {/* Horizontal scrolling cards */}
            <div className="flex gap-2 overflow-x-auto">
              {[1, 2, 3].map((card) => (
                <div
                  key={card}
                  className="shrink-0 w-72 rounded-3xl border border-accent p-4 flex flex-col gap-6"
                >
                  {/* Icon */}
                  <Skeleton className="h-8 w-8" />
                  {/* Title */}
                  <div className="flex-1 flex flex-col gap-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                    {/* Badges */}
                    <div className="flex gap-1 mt-2">
                      <Skeleton className="h-8 w-20 rounded-xl" />
                      <Skeleton className="h-8 w-24 rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
