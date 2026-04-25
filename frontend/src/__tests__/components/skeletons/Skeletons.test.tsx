import { render } from '@testing-library/react';

jest.mock('@/components/Layout', () => ({ children }: any) => (
  <div data-testid="layout">{children}</div>
));
jest.mock('@/components/Section', () => ({ children }: any) => (
  <div data-testid="section">{children}</div>
));
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
}));

import HomeSkeleton from '@/components/skeletons/HomeSkeleton';
import PatientSkeleton, {
  PatientDailyInterventionCardSkeleton,
  PatientActivitySectionSkeleton,
  PatientHealthCheckInSectionSkeleton,
} from '@/components/skeletons/PatientSkeleton';
import PatientPlanSkeleton from '@/components/skeletons/PatientPlanSkeleton';
import PatientProcessSkeleton, {
  PatientProcessLoadingContent,
} from '@/components/skeletons/PatientProcessSkeleton';
import PatientInterventionsLibrarySkeleton, {
  PatientInterventionsLibrarySectionsSkeleton,
} from '@/components/skeletons/PatientInterventionsLibrarySkeleton';
import PatientInterventionDetailSkeleton from '@/components/skeletons/PatientInterventionDetailSkeleton';
import PatientProfileSkeleton from '@/components/skeletons/PatientProfileSkeleton';
import TermsAndConditionsSkeleton from '@/components/skeletons/TermsAndConditionsSkeleton';
import PrivacyPolicySkeleton from '@/components/skeletons/PrivacyPolicySkeleton';

const smoke = (Component: React.ComponentType) => () => {
  const { container } = render(<Component />);
  expect(container.firstChild).toBeTruthy();
};

describe('Skeleton components', () => {
  it('HomeSkeleton renders', smoke(HomeSkeleton));
  it('PatientSkeleton renders', smoke(PatientSkeleton));
  it('PatientDailyInterventionCardSkeleton renders', smoke(PatientDailyInterventionCardSkeleton));
  it('PatientActivitySectionSkeleton renders', smoke(PatientActivitySectionSkeleton));
  it('PatientHealthCheckInSectionSkeleton renders', smoke(PatientHealthCheckInSectionSkeleton));
  it('PatientPlanSkeleton renders', smoke(PatientPlanSkeleton));
  it('PatientProcessSkeleton renders', smoke(PatientProcessSkeleton));
  it('PatientProcessLoadingContent renders', smoke(PatientProcessLoadingContent));
  it('PatientInterventionsLibrarySkeleton renders', smoke(PatientInterventionsLibrarySkeleton));
  it(
    'PatientInterventionsLibrarySectionsSkeleton renders',
    smoke(PatientInterventionsLibrarySectionsSkeleton)
  );
  it('PatientInterventionDetailSkeleton renders', smoke(PatientInterventionDetailSkeleton));
  it('PatientProfileSkeleton renders', smoke(PatientProfileSkeleton));
  it('TermsAndConditionsSkeleton renders', smoke(TermsAndConditionsSkeleton));
  it('PrivacyPolicySkeleton renders', smoke(PrivacyPolicySkeleton));
});
