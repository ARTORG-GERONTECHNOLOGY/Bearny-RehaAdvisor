import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const PatientInterventionsSkeleton: React.FC = () => (
  <div className="flex flex-col min-h-screen">
    <main className="flex-1">
      <div className="container mx-auto px-4 pb-6 pt-36 max-w-4xl">
        {/* Filters card */}
        <div className="flex flex-col gap-3 mb-6 p-4 rounded-lg border border-muted">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        {/* Intervention cards */}
        <div className="flex flex-col">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 p-4 rounded-lg border border-muted">
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-4/5" />
                <div className="flex gap-2 mt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-20 shrink-0 self-center rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </main>
  </div>
);

export default PatientInterventionsSkeleton;
