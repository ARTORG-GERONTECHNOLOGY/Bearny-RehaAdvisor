import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const PatientSkeleton: React.FC = () => (
  <div className="flex flex-col min-h-screen patient-root">
    <main className="flex-1 patient-main">
      <div className="w-full px-4 patient-container">
        {/* WelcomeArea */}
        <div className="flex flex-col items-center gap-2 py-6 patient-section">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-36" />
        </div>

        {/* FitbitConnectButton */}
        <div className="flex justify-center py-4 patient-section">
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>

        {/* DailyVitalsPrompt */}
        <div className="flex justify-center py-4 patient-section">
          <Skeleton className="h-40 w-full max-w-2xl" />
        </div>

        {/* ActivitySummary */}
        <div className="flex justify-center py-4 patient-section">
          <Skeleton className="h-40 w-full max-w-2xl" />
        </div>

        {/* InterventionList */}
        <div className="flex justify-center py-4 patient-section">
          <Skeleton className="h-40 w-full max-w-2xl" />
        </div>
      </div>
    </main>
  </div>
);

export default PatientSkeleton;
