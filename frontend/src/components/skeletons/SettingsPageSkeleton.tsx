import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const SettingsPageSkeleton: React.FC = () => (
  <div className="min-h-screen">
    <main className="flex-1">
      <div className="container mx-auto px-4 pb-6 pt-36 max-w-4xl">
        <Skeleton className="h-16 w-full" />
      </div>
    </main>
  </div>
);

export default SettingsPageSkeleton;
