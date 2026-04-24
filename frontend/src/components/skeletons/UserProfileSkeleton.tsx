import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';
import Card from '@/components/Card';

export default function UserProfileSkeleton() {
  return (
    <Layout>
      <Skeleton className="h-8 w-48" />

      <div className="mt-8 grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-start">
        <Section>
          <Card className="flex flex-col gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </Card>
        </Section>

        <Section>
          <Card className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-6 w-44" />
          </Card>

          <div className="mt-2 flex flex-col gap-2">
            <Skeleton className="h-10 w-36 rounded-full" />
            <Skeleton className="h-10 w-44 rounded-full" />
          </div>
        </Section>

        <Section>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full rounded-full" />
            <Skeleton className="h-7 w-full rounded-full" />
          </div>
        </Section>
      </div>
    </Layout>
  );
}
