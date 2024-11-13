import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Therapist from './pages/Therapist';
import UnauthorizedAccess from './pages/UnauthorizedAccess';
import ForgottenPassword from './pages/ForgottenPassword';
import UserProfile from './pages/UserProfile';
import PatientHome from './pages/PatientHome';
import PatientView from './pages/patient';
import AdminDashboard from './pages/AdminDashboard';
import ResearcherView from './pages/ResearcherView';
import AddRecomendations from './pages/AddRecomendations';
import AddPatient from './pages/AddPatient';
import RehabTable from './pages/RehabTable';
import TherapistRecomendations from './pages/TherapistRecomendations';

// Lazy load pages for better performance
const Home = lazy(() => import("./pages/Home"));
const ErrorPage = lazy(() => import("./components/common/Error"));

const App: React.FC = () => {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/error" element={<ErrorPage />} />
            <Route path ="/therapist" element={<Therapist />}/>
            <Route path="/unauthorized" element={<UnauthorizedAccess />} />
            <Route path="/forgottenpwd" element={<ForgottenPassword />} />/
            <Route path="/userprofile" element={<UserProfile />} />
            <Route path={"/patient_home"} element={<PatientHome />}/>
            <Route path="/patient" element={<PatientView />}/>
            <Route path={"/addashboard"} element={<AdminDashboard />}/>
            <Route path="/researcher" element={<ResearcherView />}/>
            <Route path="/addcontent" element={<AddRecomendations />}/>
            <Route path="/addpatient" element={<AddPatient />}/>
            <Route path="/rehabtable" element={<RehabTable />}/>
            <Route path="/interventions" element={<TherapistRecomendations />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </React.StrictMode>
  );
};

export default App;
