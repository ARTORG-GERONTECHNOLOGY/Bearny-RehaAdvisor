import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

function SectionBlock({ listItems = 0 }: { listItems?: number }) {
  return (
    <div className="mb-6">
      <Skeleton className="h-6 w-44 mb-2" />
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-5/6 mb-1" />
      {listItems > 0 && (
        <div className="pl-4 mt-2 flex flex-col gap-1">
          {Array.from({ length: listItems }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-3/4" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PrivacyPolicySkeleton() {
  return (
    <Layout>
      <div className="max-w-3xl">
        {/* Page title */}
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-48 mb-4" />

        {/* Intro paragraph */}
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-4/5 mb-8" />

        <SectionBlock listItems={3} />
        <SectionBlock />
        <SectionBlock />
        <SectionBlock />
        <SectionBlock listItems={3} />
        <SectionBlock />
      </div>
    </Layout>
  );
}
