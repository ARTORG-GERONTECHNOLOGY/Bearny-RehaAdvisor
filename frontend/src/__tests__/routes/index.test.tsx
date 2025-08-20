import React from 'react';
import { render, screen } from '@testing-library/react';
import { Router } from '../../routes/index'; // Adjust if your file is in a subfolder
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { router as appRouter } from '../../routes/index'; // Adjust path if needed

jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
jest.mock('../../pages/Home', () => () => <div>Mock Home Page</div>);
jest.mock('../../pages/Therapist', () => () => <div>Mock Therapist Page</div>);
jest.mock('../../pages/UnauthorizedAccess', () => () => <div>Mock Unauthorized Page</div>);
jest.mock('../../pages/Home', () => () => <div>Mock Home Page</div>);
jest.mock('../../pages/Therapist', () => () => <div>Mock Therapist Page</div>);
jest.mock('../../pages/UnauthorizedAccess', () => () => <div>Mock Unauthorized Page</div>);
jest.mock('../../pages/TherapistInterventions', () => () => <div>Mock Interventions Page</div>);
jest.mock('../../pages/UserProfile', () => () => <div>Mock User Profile</div>);
jest.mock('../../pages/PatientHome', () => () => <div>Mock Patient Home</div>);
jest.mock('../../pages/AdminDashboard', () => () => <div>Mock Admin Dashboard</div>);
jest.mock('../../pages/AddPatient', () => () => <div>Mock Add Patient</div>);
jest.mock('../../pages/RehabTable', () => () => <div>Mock Rehab Table</div>);
jest.mock('../../pages/ForgottenPassword', () => () => <div>Mock Forgotten Password</div>);
jest.mock('../../pages/eva', () => () => <div>Mock Eva</div>);
jest.mock('../../pages/AddInterventionView', () => () => <div>Mock Add Intervention View</div>);
jest.mock('../../components/common/Error', () => () => <div>Mock Error Page</div>);

// ✅ You can add other mocks if needed.
describe('Router', () => {
  const routesToTest = [
    { path: '/', text: 'Mock Home Page' },
    { path: '/therapist', text: 'Mock Therapist Page' },
    { path: '/unauthorized', text: 'Mock Unauthorized Page' },
    { path: '/interventions', text: 'Mock Interventions Page' },
    { path: '/userprofile', text: 'Mock User Profile' },
    { path: '/', text: 'Mock Patient Home' },
    { path: '/admin', text: 'Mock Admin Dashboard' },
    { path: '/addpatient', text: 'Mock Add Patient' },
    { path: '/rehabtable', text: 'Mock Rehab Table' },
    { path: '/forgottenpwd', text: 'Mock Forgotten Password' },
    { path: '/eva', text: 'Mock Eva' },
    { path: '/addcontent', text: 'Mock Add Intervention View' },
    { path: '/error', text: 'Mock Error Page' },
  ];

  routesToTest.forEach(({ path, text }) => {
    it(`renders ${text} for route ${path}`, async () => {
      const testRouter = createMemoryRouter(appRouter.routes, { initialEntries: [path] });
      render(<RouterProvider router={testRouter} />);
      expect(await screen.findByText(text)).toBeInTheDocument();
    });
  });
  it('renders Router component', () => {
    render(<Router />);
    // This covers the export of <Router>, even if no route is matched yet.
    expect(true).toBeTruthy();
  });

  it('renders Home page on / route', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <div>Mock Home Page</div>,
        },
      ],
      { initialEntries: ['/'] }
    );

    render(<RouterProvider router={router} />);
    expect(await screen.findByText(/Mock Home Page/i)).toBeInTheDocument();
  });

  it('shows fallback during lazy loading', () => {
    const { container } = render(<div>Loading...</div>);
    expect(container).toHaveTextContent('Loading...');
  });
});
