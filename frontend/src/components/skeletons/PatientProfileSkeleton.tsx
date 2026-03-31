import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientProfileSkeleton() {
  return (
    <Layout>
      {/* Title skeleton */}
      <Skeleton className="h-8 w-48" />

      {/* Settings Section */}
      <Section className="mt-8">
        {/* Section header */}
        <div className="p-2 pl-4">
          <Skeleton className="h-7 w-24" />
        </div>

        {/* Language card */}
        <div className="border border-accent p-4 rounded-3xl flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-32" />
        </div>

        {/* Notifications card */}
        <div className="border border-accent p-4 rounded-3xl flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        </div>
      </Section>

      {/* Contact Section */}
      <Section className="mt-8">
        {/* Section header with help badge */}
        <div className="flex justify-between items-center p-2 pl-4">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>

        {/* Contact card */}
        <div className="border border-accent p-4 rounded-3xl flex flex-col items-start gap-3">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-10 w-56 rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
      </Section>

      {/* Logos Section */}
      <div className="flex flex-col items-center gap-6 mt-4 mb-12">
        <Skeleton className="h-[80px] w-[80px]" />
        <Skeleton className="h-[40px] w-[160px]" />
        <Skeleton className="h-[40px] w-[160px]" />
      </div>

      {/* Logout Section */}
      <Section className="mt-8">
        <Skeleton className="h-14 w-full rounded-full" />
      </Section>
    </Layout>
  );
}
