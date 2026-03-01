import React from 'react';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsPageSkeleton() {
  return (
    <Layout>
      {/* Title skeleton */}
      <div className="flex items-center gap-[6px]">
        <Skeleton className="w-6 h-6 rounded" />
        <Skeleton className="h-7 w-32" />
      </div>

      {/* Settings card skeleton */}
      <div className="mt-4 bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </div>
    </Layout>
  );
}
