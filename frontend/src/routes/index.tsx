import { createElement, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const Home = lazy(() => import('../pages/Home'));
const Therapist = lazy(() => import('../pages/Therapist'));
const UnauthorizedAccess = lazy(() => import('../pages/UnauthorizedAccess'));
const ForgottenPassword = lazy(() => import('../pages/ForgottenPassword'));
const UserProfile = lazy(() => import('../pages/UserProfile'));
const PatientView = lazy(() => import('../pages/Patient'));
const AdminDashboard = lazy(() => import('../pages/AdminDashboard'));
// const ResearcherView = lazy(() => import('../pages/ResearcherView'));
const AddRecomendations = lazy(() => import('../pages/AddInterventionView'));
const AddPatient = lazy(() => import('../pages/AddPatient'));
const RehabTable = lazy(() => import('../pages/RehabTable'));
const TherapistRecomendations = lazy(() => import('../pages/TherapistInterventions'));
const ErrorPages = lazy(() => import('../components/common/Error'));
const HealthSlider = lazy(() => import('../pages/eva'));
const TermsAndConditions = lazy(() => import('../pages/TermsAndConditions'));
const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'));
const SuccessPage = lazy(() => import('../pages/SuccessPage'));
const ErrorPage = lazy(() => import('../pages/ErrorPage'));
const HealthPage = lazy(() => import('../pages/HealthPage'));
const HelpPage = lazy(() => import('../pages/Help'));
const Eva = lazy(() => import('../pages/eva2'));
const HealthSliderDownloadsPage = lazy(() => import('../pages/HealthSliderDownloadsPage'));
import RootLayout from '../RootLayout';

// -------------------- Loading Fallback --------------------
function LoadingFallback() {
  return createElement('div', null, 'Loading...');
}

// -------------------- Router Definition --------------------
export const router = createBrowserRouter([
  {
    path: '/',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(Home)
    ),
  },
  {
    path: '/error',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(ErrorPages) }) // ✅ FIXED here
    ),
  },
  {
    path: '/therapist',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(Therapist) })
    ),
  },
  {
    path: '/unauthorized',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(UnauthorizedAccess) })
    ),
  },
  {
    path: '/forgottenpwd',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(ForgottenPassword) })
    ),
  },
  {
    path: '/userprofile',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(UserProfile) })
    ),
  },
  {
    path: '/patient',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(PatientView) })
    ),
  },
  
  {
    path: '/admin',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(AdminDashboard) })
    ),
  },
  // Uncomment if you need this route:
  // {
  //   path: '/researcher',
  //   element: createElement(
  //     Suspense,
  //     { fallback: createElement(LoadingFallback) },
  //     createElement(RootLayout, { children: createElement(ResearcherView) })
  //   ),
  // },
  {
    path: '/addcontent',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(AddRecomendations) })
    ),
  },
  {
    path: '/addpatient',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(AddPatient) })
    ),
  },
  {
    path: '/rehabtable',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(RehabTable) })
    ),
  },
  {
    path: '/interventions',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(TherapistRecomendations) })
    ),
  },
  {
    path: '/eva',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(HealthSlider)
    ),
  },
  {
    path: '/terms',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(TermsAndConditions)
    ),
  },
  {
    path: '/privacypolicy',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(PrivacyPolicy)
    ),
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
    element: createElement(HealthPage),
  },
  {
    path: '/help',
    element: createElement(HelpPage),
  },
  {
    path: '/eva2',
    element: createElement(Eva),
  },
  {
    path: '/healthslider-downloads',
    element: createElement(HealthSliderDownloadsPage),
  }
]);

export function Router() {
  return createElement(RouterProvider, { router });
}
