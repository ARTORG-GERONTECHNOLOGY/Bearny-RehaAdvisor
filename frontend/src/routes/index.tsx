import { createElement, lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent, ReactElement } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

import RootLayout from '@/RootLayout';
import HomeSkeleton from '@/components/skeletons/HomeSkeleton';
import PatientSkeleton from '@/components/skeletons/PatientSkeleton';
import PatientPlanSkeleton from '@/components/skeletons/PatientPlanSkeleton';
import PatientInterventionsLibrarySkeleton from '@/components/skeletons/PatientInterventionsLibrarySkeleton';
import PatientProcessSkeleton from '@/components/skeletons/PatientProcessSkeleton';
import PatientInterventionDetailSkeleton from '@/components/skeletons/PatientInterventionDetailSkeleton';
import PatientProfileSkeleton from '@/components/skeletons/PatientProfileSkeleton';
import UserProfileSkeleton from '@/components/skeletons/UserProfileSkeleton';
import TermsAndConditionsSkeleton from '@/components/skeletons/TermsAndConditionsSkeleton';
import PrivacyPolicySkeleton from '@/components/skeletons/PrivacyPolicySkeleton';

/**
 * React.lazy wrapper for stale deploy chunks.
 * If a dynamic import fails (old hashed asset URL), reload once to fetch
 * fresh HTML/chunk paths. Uses sessionStorage to avoid reload loops.
 */
function lazyWithRetry(
  fn: () => Promise<{ default: ComponentType<any> }>
): LazyExoticComponent<ComponentType<any>> {
  return lazy(() =>
    fn().catch((error: unknown) => {
      const key = 'chunk-load-reloaded';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Never resolves – the reload takes over
        return new Promise<never>(() => {});
      }
      // Already reloaded once; clear flag and surface the real error
      sessionStorage.removeItem(key);
      throw error;
    })
  );
}

const Home = lazyWithRetry(() => import('@/pages/Home'));
const Therapist = lazyWithRetry(() => import('@/pages/Therapist'));
const UnauthorizedAccess = lazyWithRetry(() => import('@/pages/UnauthorizedAccess'));
const ForgottenPassword = lazyWithRetry(() => import('@/pages/ForgottenPassword'));
const UserProfile = lazyWithRetry(() => import('@/pages/UserProfile'));
const PatientView = lazyWithRetry(() => import('@/pages/Patient'));
const AdminDashboard = lazyWithRetry(() => import('@/pages/AdminDashboard'));
const AddRecomendations = lazyWithRetry(() => import('@/pages/AddInterventionView'));
const AddPatient = lazyWithRetry(() => import('@/pages/AddPatient'));
const RehabTable = lazyWithRetry(() => import('@/pages/RehabTable'));
const TherapistRecomendations = lazyWithRetry(() => import('@/pages/TherapistInterventions'));
const ErrorPage = lazy(() => import('@/pages/ErrorPage'));
const HealthSlider = lazyWithRetry(() => import('@/pages/eva'));
const TermsAndConditions = lazyWithRetry(() => import('@/pages/TermsAndConditions'));
const PrivacyPolicy = lazyWithRetry(() => import('@/pages/PrivacyPolicy'));
const SuccessPage = lazyWithRetry(() => import('@/pages/SuccessPage'));
const FitbitErrorPage = lazy(() => import('@/pages/FitbitErrorPage'));
const HealthPage = lazyWithRetry(() => import('@/pages/HealthPage'));
const HelpPage = lazyWithRetry(() => import('@/pages/Help'));
const Eva = lazyWithRetry(() => import('@/pages/eva2'));
const HealthSliderDownloadsPage = lazyWithRetry(() => import('@/pages/HealthSliderDownloadsPage'));
const PatientInterventionsLibrary = lazyWithRetry(
  () => import('@/pages/PatientInterventionsLibrary')
);
const PatientPlan = lazyWithRetry(() => import('@/pages/PatientPlan'));
const PatientProcess = lazyWithRetry(() => import('@/pages/PatientProcess'));
const PatientInterventionDetail = lazyWithRetry(() => import('@/pages/PatientInterventionDetail'));
const PatientProfile = lazyWithRetry(() => import('@/pages/PatientProfile'));

// -------------------- Loading Fallback --------------------
function LoadingFallback() {
  return createElement('div', null, 'Loading...');
}

// helper to wrap lazy pages consistently (optionally pass a custom fallback)
const withSuspense = (el: ReactElement, fallback: ReactElement = createElement(LoadingFallback)) =>
  createElement(Suspense, { fallback }, el);

// -------------------- Router Definition --------------------
export const router = createBrowserRouter([
  {
    // Root catch-all: errorElement here covers every child route
    path: '/',
    errorElement: createElement(ErrorPage),
    children: [
      {
        index: true,
        element: withSuspense(createElement(Home), createElement(HomeSkeleton)),
      },
      {
        path: 'error',
        element: withSuspense(createElement(RootLayout, { children: createElement(ErrorPage) })),
      },
      {
        path: 'therapist',
        element: withSuspense(createElement(RootLayout, { children: createElement(Therapist) })),
      },
      {
        path: 'unauthorized',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(UnauthorizedAccess) })
        ),
      },
      {
        path: 'forgottenpwd',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(ForgottenPassword) })
        ),
      },
      {
        path: 'userprofile',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(UserProfile) }),
          createElement(UserProfileSkeleton)
        ),
      },
      {
        path: 'patient',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientView) }),
          createElement(PatientSkeleton)
        ),
      },
      {
        path: 'admin',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(AdminDashboard) })
        ),
      },
      {
        path: 'addcontent',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(AddRecomendations) })
        ),
      },
      {
        path: 'addpatient',
        element: withSuspense(createElement(RootLayout, { children: createElement(AddPatient) })),
      },
      {
        path: 'rehabtable',
        element: withSuspense(createElement(RootLayout, { children: createElement(RehabTable) })),
      },
      {
        path: 'interventions',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(TherapistRecomendations) })
        ),
      },
      {
        path: 'eva',
        element: withSuspense(createElement(HealthSlider)),
      },
      {
        path: 'terms',
        element: withSuspense(
          createElement(TermsAndConditions),
          createElement(TermsAndConditionsSkeleton)
        ),
      },
      {
        path: 'privacypolicy',
        element: withSuspense(createElement(PrivacyPolicy), createElement(PrivacyPolicySkeleton)),
      },
      {
        path: 'fitbit-success',
        element: createElement(SuccessPage),
      },
      {
        path: 'fitbit-error',
        element: createElement(FitbitErrorPage),
      },
      {
        path: 'health',
        element: withSuspense(createElement(HealthPage)),
      },
      {
        path: 'help',
        element: withSuspense(createElement(HelpPage)),
      },
      {
        path: 'icf/:patientId?',
        element: withSuspense(createElement(Eva)),
      },
      {
        path: 'eva2',
        element: createElement(Navigate, { to: '/icf', replace: true }),
      },
      {
        path: 'healthslider-downloads',
        element: withSuspense(createElement(HealthSliderDownloadsPage)),
      },
      {
        path: 'patient-plan',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientPlan) }),
          createElement(PatientPlanSkeleton)
        ),
      },
      {
        path: 'patient-process',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientProcess) }),
          createElement(PatientProcessSkeleton)
        ),
      },
      {
        path: 'patient-interventions',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientInterventionsLibrary) }),
          createElement(PatientInterventionsLibrarySkeleton)
        ),
      },
      {
        path: 'patient-intervention/:interventionId',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientInterventionDetail) }),
          createElement(PatientInterventionDetailSkeleton)
        ),
      },
      {
        path: 'patient-profile',
        element: withSuspense(
          createElement(RootLayout, { children: createElement(PatientProfile) }),
          createElement(PatientProfileSkeleton)
        ),
      },

      // Catch-all (must be last)
      {
        path: '*',
        element: createElement(Navigate, { to: '/', replace: true }),
      },
    ],
  },
]);

export function Router() {
  return createElement(RouterProvider, { router });
}
