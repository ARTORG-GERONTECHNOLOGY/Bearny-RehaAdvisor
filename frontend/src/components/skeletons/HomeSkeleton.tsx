import { Skeleton } from '@/components/ui/skeleton';

export default function HomeSkeleton() {
  return (
    <div className="d-flex flex-column min-vh-100 bg-[#F2F2F7]">
      {/* Header placeholder */}
      <div className="d-flex align-items-center px-4 py-3 border-bottom bg-white">
        <Skeleton className="h-8 w-32" />
        <div className="ms-auto">
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Hero placeholder */}
      <div className="flex-grow-1 d-flex align-items-center py-5">
        <div className="container-md px-4 px-sm-5">
          <div className="d-flex flex-column gap-3" style={{ maxWidth: '480px' }}>
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-12 w-36 mt-2" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
      </div>

      {/* Footer placeholder */}
      <div className="d-flex align-items-center justify-content-center px-4 py-3 border-top bg-white">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
