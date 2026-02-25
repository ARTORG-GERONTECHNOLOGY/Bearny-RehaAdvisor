import React from 'react';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';

const SettingsPageSkeleton: React.FC = () => (
  <Layout>
    <div className="container mx-auto max-w-[90%] md:max-w-screen-md">
      {/* Title skeleton */}
      <div className="pt-16 md:pt-0 flex items-center gap-[6px]">
        <Skeleton className="w-6 h-6 rounded" />
        <Skeleton className="h-7 w-32" />
      </div>

      {/* Settings card skeleton */}
      <div className="mt-4 bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5 flex flex-col gap-[2px]">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  </Layout>
);

export default SettingsPageSkeleton;
