import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';

export function PatientInterventionsLibrarySectionsSkeleton() {
  return (
    <>
      {[1, 2, 3].map((section) => (
        <Section key={section}>
          <div className="p-2 pl-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="shrink-0 w-72 rounded-3xl border border-accent p-4 flex flex-col gap-6"
              >
                <Skeleton className="h-8 w-8" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <div className="flex gap-1 mt-2">
                    <Skeleton className="h-8 w-20 rounded-xl" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

export default function PatientInterventionsLibrarySkeleton() {
  return (
    <Layout>
      <Skeleton className="h-8 w-32" />

      <div className="mt-8 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block lg:sticky lg:top-24 self-start">
          <div className="rounded-[40px] bg-white p-4">
            <div className="flex flex-col gap-8">
              <Skeleton className="h-14 w-full rounded-full" />

              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, sectionIndex) => (
                  <div key={sectionIndex} className="rounded-3xl border border-accent px-4 py-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-6 w-28" />
                      <Skeleton className="h-[18px] w-[18px] rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-2 mt-16 lg:mt-0">
          <div className="mx-4 mb-14 flex gap-2 lg:hidden">
            <Skeleton className="h-14 flex-1 rounded-full" />
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          </div>

          <PatientInterventionsLibrarySectionsSkeleton />
        </div>
      </div>
    </Layout>
  );
}
