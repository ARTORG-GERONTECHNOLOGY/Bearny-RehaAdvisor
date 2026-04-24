import { Skeleton } from '@/components/ui/skeleton';

export default function HomeSkeleton() {
  return (
    <div className="d-flex flex-column min-vh-100 home-root bg-back">
      <main className="flex-grow-1 d-flex align-items-center py-4 py-sm-5 z-1">
        <div className="container-md px-3 px-sm-4 px-md-5">
          <div
            className="d-flex flex-column gap-3 text-center text-md-start align-items-center align-items-md-start"
            style={{ maxWidth: '480px' }}
          >
            {/* h1 headline */}
            <Skeleton className="h-10 w-3/4" />
            {/* h2 subheadline */}
            <Skeleton className="h-6 w-2/3" />
            {/* body copy */}
            <Skeleton className="h-5 w-full" />
            {/* Login button */}
            <Skeleton className="h-12 w-36 mt-2" />
            {/* Register link */}
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </main>

      <div className="d-flex align-items-center justify-content-center px-4 py-3 border-top bg-white">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
