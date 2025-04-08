import { createElement, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const Home = lazy(() => import('../pages/Home'));
const Therapist = lazy(() => import('../pages/Therapist'));
const UnauthorizedAccess = lazy(() => import('../pages/UnauthorizedAccess'));
const ForgottenPassword = lazy(() => import('../pages/ForgottenPassword'));
const UserProfile = lazy(() => import('../pages/UserProfile'));
const PatientHome = lazy(() => import('../pages/PatientHome'));
const PatientView = lazy(() => import('../pages/patient'));
const AdminDashboard = lazy(() => import('../pages/AdminDashboard'));
const ResearcherView = lazy(() => import('../pages/ResearcherView'));
const AddRecomendations = lazy(() => import('../pages/AddRecomendations'));
const AddPatient = lazy(() => import('../pages/AddPatient'));
const RehabTable = lazy(() => import('../pages/RehabTable'));
const TherapistRecomendations = lazy(() => import('../pages/TherapistRecomendations'));
const ErrorPage = lazy(() => import('../components/common/Error'));
const HealthSlider = lazy(() => import('../pages/eva'));

// Define a loading fallback function using createElement
function LoadingFallback() {
  return createElement('div', null, 'Loading...');
}

// Define the router with createElement inside Suspense
export const router = createBrowserRouter([
  { path: '/', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(Home)) },
  { path: '/error', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(ErrorPage)) },
  { path: '/therapist', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(Therapist)) },
  { path: '/unauthorized', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(UnauthorizedAccess)) },
  { path: '/forgottenpwd', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(ForgottenPassword)) },
  { path: '/userprofile', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(UserProfile)) },
  { path: '/patient_home', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(PatientHome)) },
  { path: '/patient', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(PatientView)) },
  { path: '/admindashboard', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(AdminDashboard)) },
  { path: '/researcher', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(ResearcherView)) },
  { path: '/addcontent', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(AddRecomendations)) },
  { path: '/addpatient', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(AddPatient)) },
  { path: '/rehabtable', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(RehabTable)) },
  { path: '/interventions', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(TherapistRecomendations)) },
  { path: '/eva', element: createElement(Suspense, { fallback: createElement(LoadingFallback) }, createElement(HealthSlider)) },
]);

// Replace JSX with createElement
export function Router() {
  return createElement(RouterProvider, { router });
}
