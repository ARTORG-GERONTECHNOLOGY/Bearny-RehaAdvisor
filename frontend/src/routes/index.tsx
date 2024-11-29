import React, { createElement, lazy, Suspense } from 'react';
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

function LoadingFallback() {
  return <div>Loading...</div>;
}

export const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<LoadingFallback />}><Home /></Suspense> },
  { path: '/error', element: <Suspense fallback={<LoadingFallback />}><ErrorPage /></Suspense> },
  { path: '/therapist', element: <Suspense fallback={<LoadingFallback />}><Therapist /></Suspense> },
  { path: '/unauthorized', element: <Suspense fallback={<LoadingFallback />}><UnauthorizedAccess /></Suspense> },
  { path: '/forgottenpwd', element: <Suspense fallback={<LoadingFallback />}><ForgottenPassword /></Suspense> },
  { path: '/userprofile', element: <Suspense fallback={<LoadingFallback />}><UserProfile /></Suspense> },
  { path: '/patient_home', element: <Suspense fallback={<LoadingFallback />}><PatientHome /></Suspense> },
  { path: '/patient', element: <Suspense fallback={<LoadingFallback />}><PatientView /></Suspense> },
  { path: '/admindashboard', element: <Suspense fallback={<LoadingFallback />}><AdminDashboard /></Suspense> },
  { path: '/researcher', element: <Suspense fallback={<LoadingFallback />}><ResearcherView /></Suspense> },
  { path: '/addcontent', element: <Suspense fallback={<LoadingFallback />}><AddRecomendations /></Suspense> },
  { path: '/addpatient', element: <Suspense fallback={<LoadingFallback />}><AddPatient /></Suspense> },
  { path: '/rehabtable', element: <Suspense fallback={<LoadingFallback />}><RehabTable /></Suspense> },
  { path: '/interventions', element: <Suspense fallback={<LoadingFallback />}><TherapistRecomendations /></Suspense> },
]);

export function Router(): JSX.Element {
  return createElement(RouterProvider, { router });
}
