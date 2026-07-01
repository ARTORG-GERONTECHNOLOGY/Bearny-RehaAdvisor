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
