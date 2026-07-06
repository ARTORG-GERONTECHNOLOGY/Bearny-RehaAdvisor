import { Skeleton } from '@/components/ui/skeleton';

export function TherapistPatientDetailLoadingContent() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56" />
      <div className="flex gap-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

export function PatientInfoContentLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-44" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-32" />
      </div>

      <div className="columns-1 md:columns-2 xl:columns-3 gap-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
