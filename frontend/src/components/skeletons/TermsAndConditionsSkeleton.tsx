import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

function SectionBlock() {
  return (
    <div className="mb-6">
      <Skeleton className="h-6 w-40 mb-2" />
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export default function TermsAndConditionsSkeleton() {
  return (
    <Layout>
      <div className="max-w-3xl">
        {/* Page title */}
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-4/5 mb-8" />

        <SectionBlock />
        <SectionBlock />
        <SectionBlock />
        <SectionBlock />
        <SectionBlock />

        {/* Footer note */}
        <Skeleton className="h-4 w-3/4 mt-4" />
      </div>
    </Layout>
  );
}
