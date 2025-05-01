import { createElement, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const Home = lazy(() => import('../pages/Home'));
const Therapist = lazy(() => import('../pages/Therapist'));
const UnauthorizedAccess = lazy(() => import('../pages/UnauthorizedAccess'));
const ForgottenPassword = lazy(() => import('../pages/ForgottenPassword'));
const UserProfile = lazy(() => import('../pages/UserProfile'));
const PatientHome = lazy(() => import('../pages/PatientHome'));
const PatientView = lazy(() => import('../pages/Patient'));
const AdminDashboard = lazy(() => import('../pages/AdminDashboard'));
// const ResearcherView = lazy(() => import('../pages/ResearcherView'));
const AddRecomendations = lazy(() => import('../pages/AddInterventionView'));
const AddPatient = lazy(() => import('../pages/AddPatient'));
const RehabTable = lazy(() => import('../pages/RehabTable'));
const TherapistRecomendations = lazy(() => import('../pages/TherapistInterventions'));
const ErrorPage = lazy(() => import('../components/common/Error'));
const HealthSlider = lazy(() => import('../pages/eva'));

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
      createElement(RootLayout, { children: createElement(ErrorPage) }) // ✅ FIXED here
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
    path: '/patient_home',
    element: createElement(
      Suspense,
      { fallback: createElement(LoadingFallback) },
      createElement(RootLayout, { children: createElement(PatientHome) })
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
]);

export function Router() {
  return createElement(RouterProvider, { router });
}
