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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export function HealthPageContentLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-10" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            <Skeleton className="h-[212px] w-full" />
            <Skeleton className="h-[212px] w-full" />
            {i < 3 && <Skeleton className="h-[212px] w-full" />}
            {i === 2 && <Skeleton className="h-[212px] w-full" />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RehabilitationPlanContentLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <Skeleton className="h-24 w-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}
