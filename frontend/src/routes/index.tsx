import { createElement, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

const Home = lazy(() => import('@/pages/Home'));
const Therapist = lazy(() => import('@/pages/Therapist'));
const UnauthorizedAccess = lazy(() => import('@/pages/UnauthorizedAccess'));
const ForgottenPassword = lazy(() => import('@/pages/ForgottenPassword'));
const UserProfile = lazy(() => import('@/pages/UserProfile'));
const PatientView = lazy(() => import('@/pages/Patient'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AddRecomendations = lazy(() => import('@/pages/AddInterventionView'));
const AddPatient = lazy(() => import('@/pages/AddPatient'));
const RehabTable = lazy(() => import('@/pages/RehabTable'));
const TherapistRecomendations = lazy(() => import('@/pages/TherapistInterventions'));
const ErrorPages = lazy(() => import('@/components/common/Error'));
const HealthSlider = lazy(() => import('@/pages/eva'));
const TermsAndConditions = lazy(() => import('@/pages/TermsAndConditions'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const SuccessPage = lazy(() => import('@/pages/SuccessPage'));
const ErrorPage = lazy(() => import('@/pages/ErrorPage'));
const HealthPage = lazy(() => import('@/pages/HealthPage'));
const HelpPage = lazy(() => import('@/pages/Help'));
const Eva = lazy(() => import('@/pages/eva2'));
const HealthSliderDownloadsPage = lazy(() => import('@/pages/HealthSliderDownloadsPage'));
const PatientInterventionsLibrary = lazy(() => import('@/pages/PatientInterventionsLibrary'));
import RootLayout from '@/RootLayout';
import PatientSkeleton from '@/components/skeletons/PatientSkeleton';
import PatientInterventionsSkeleton from '@/components/skeletons/PatientInterventionsSkeleton';

// -------------------- Loading Fallback --------------------
function LoadingFallback() {
  return createElement('div', null, 'Loading...');
}

// helper to wrap lazy pages consistently (optionally pass a custom fallback)
const withSuspense = (
  el: React.ReactElement,
  fallback: React.ReactElement = createElement(LoadingFallback)
) => createElement(Suspense, { fallback }, el);

// -------------------- Router Definition --------------------
export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(createElement(Home)),
  },
  {
    path: '/error',
    element: withSuspense(createElement(RootLayout, { children: createElement(ErrorPages) })),
  },
  {
    path: '/therapist',
    element: withSuspense(createElement(RootLayout, { children: createElement(Therapist) })),
  },
  {
    path: '/unauthorized',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(UnauthorizedAccess) })
    ),
  },
  {
    path: '/forgottenpwd',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(ForgottenPassword) })
    ),
  },
  {
    path: '/userprofile',
    element: withSuspense(createElement(RootLayout, { children: createElement(UserProfile) })),
  },
  {
    path: '/patient',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(PatientView) }),
      createElement(PatientSkeleton)
    ),
  },
  {
    path: '/admin',
    element: withSuspense(createElement(RootLayout, { children: createElement(AdminDashboard) })),
  },
  {
    path: '/addcontent',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(AddRecomendations) })
    ),
  },
  {
    path: '/addpatient',
    element: withSuspense(createElement(RootLayout, { children: createElement(AddPatient) })),
  },
  {
    path: '/rehabtable',
    element: withSuspense(createElement(RootLayout, { children: createElement(RehabTable) })),
  },
  {
    path: '/interventions',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(TherapistRecomendations) })
    ),
  },
  {
    path: '/eva',
    element: withSuspense(createElement(HealthSlider)),
  },
  {
    path: '/terms',
    element: withSuspense(createElement(TermsAndConditions)),
  },
  {
    path: '/privacypolicy',
    element: withSuspense(createElement(PrivacyPolicy)),
  },
  {
    path: '/fitbit-success',
    element: createElement(SuccessPage),
  },
  {
    path: '/fitbit-error',
    element: createElement(ErrorPage),
  },
  {
    path: '/health',
    element: withSuspense(createElement(HealthPage)),
  },
  {
    path: '/help',
    element: withSuspense(createElement(HelpPage)),
  },
  {
    path: '/eva2',
    element: withSuspense(createElement(Eva)),
  },
  {
    path: '/healthslider-downloads',
    element: withSuspense(createElement(HealthSliderDownloadsPage)),
  },
  {
    path: '/patient-interventions',
    element: withSuspense(
      createElement(RootLayout, { children: createElement(PatientInterventionsLibrary) }),
      createElement(PatientInterventionsSkeleton)
    ),
  },

  // ✅ Catch-all (must be last)
  {
    path: '*',
    element: createElement(Navigate, { to: '/', replace: true }),
  },
]);

export function Router() {
  return createElement(RouterProvider, { router });
}
