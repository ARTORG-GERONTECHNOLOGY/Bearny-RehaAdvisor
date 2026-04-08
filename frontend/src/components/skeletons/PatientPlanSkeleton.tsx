import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientPlanSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-32" />
        </div>

        <div className="flex gap-1 no-scrollbar overflow-y-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full flex-shrink-0" />
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start">
        {Array.from({ length: 7 }).map((_, dayIndex) => (
          <Section key={dayIndex}>
            <div className="flex p-2 pl-4 justify-between w-full">
              <Skeleton className="h-6 w-48" />
              {dayIndex === 0 && <Skeleton className="h-6 w-16 rounded-full" />}
            </div>

            <div className="flex items-center gap-3 rounded-3xl border border-accent p-4">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </div>
          </Section>
        ))}
      </div>
    </Layout>
  );
}
