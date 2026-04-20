import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';
import Card from '@/components/Card';

export function PatientProcessLoadingContent() {
  return (
    <div className="mt-6 flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:items-start">
      <Section>
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-[150px] lg:h-[80px] w-full rounded-[32px]" />
        </Card>
      </Section>

      <Section>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-[150px] lg:h-[80px] w-full rounded-[32px]" />
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-[150px] lg:h-[80px] w-full rounded-[32px]" />
        </Card>
      </Section>
    </div>
  );
}

export default function PatientProcessSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="h-8 w-48 rounded-full bg-zinc-200/80 animate-pulse" />
          <div className="h-6 w-32 rounded-full bg-zinc-200/80 animate-pulse" />
        </div>

        <div className="flex gap-1 no-scrollbar overflow-y-auto">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-9 w-20 shrink-0 rounded-full bg-zinc-200/80 animate-pulse" />
          ))}
        </div>
      </div>

      <PatientProcessLoadingContent />
    </Layout>
  );
}
