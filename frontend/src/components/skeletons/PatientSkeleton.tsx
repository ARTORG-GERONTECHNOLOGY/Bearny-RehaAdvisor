import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';

export function PatientDailyInterventionCardSkeleton() {
  return (
    <Section>
      <div className="flex p-2 pl-4 justify-between w-full">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-7 w-14 rounded-full" />
      </div>

      <div className="flex items-center border border-accent rounded-3xl p-4 gap-3" role="status">
        <Skeleton className="flex-none w-8 h-8 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    </Section>
  );
}

export function PatientActivitySectionSkeleton() {
  return (
    <Section>
      <div className="flex p-2 pl-4 justify-between w-full">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>

      <Skeleton className="h-[250px] lg:h-[180px] w-full rounded-3xl" />
    </Section>
  );
}

export function PatientHealthCheckInSectionSkeleton() {
  return (
    <Section>
      <div className="flex p-2 pl-4 justify-between w-full">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
        <Skeleton className="h-[200px] w-full rounded-3xl" />
        <Skeleton className="h-[200px] w-full rounded-3xl" />
      </div>
    </Section>
  );
}

export default function PatientSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-6 w-40" />
      </div>

      <div className="absolute right-0 top-12 hidden h-28 w-28 rounded-full bg-zinc-100/80 blur-2xl md:block" />

      <div className="mt-28 flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:items-start">
        <PatientDailyInterventionCardSkeleton />
        <PatientActivitySectionSkeleton />
        <PatientHealthCheckInSectionSkeleton />
      </div>
    </Layout>
  );
}
