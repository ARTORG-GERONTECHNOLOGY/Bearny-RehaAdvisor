// ✅ Mock navigate before anything else
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ✅ Mock authStore properly BEFORE importing it!
jest.mock('../../stores/authStore', () => ({
  __esModule: true,
  default: {
    id: 'mock-therapist-id',
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Admin',
  },
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import AdminDashboard from '../../pages/AdminDashboard';
import adminStore from '../../stores/adminStore';
import authStore from '../../stores/authStore'; // ✅ This uses the mocked version now!
import '@testing-library/jest-dom';

jest.mock('../../components/common/Header', () => () => <div>Mock Header</div>);
jest.mock('../../components/common/Footer', () => () => <div>Mock Footer</div>);

// Mock the apiClient
jest.mock('../../api/client', () => require('../../__mocks__/api/client'));
// Mock MobX stores
jest.mock('../../stores/adminStore');

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to unauthorized if user is not authenticated or not admin', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = 'Therapist'; // Not admin

    await act(async () => {
      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/unauthorized');
  });

  it('renders pending entries correctly', async () => {
    authStore.checkAuthentication = jest.fn().mockResolvedValue(undefined);
    authStore.isAuthenticated = true;
    authStore.userType = 'Admin';

    adminStore.fetchPendingEntries = jest.fn().mockResolvedValue(undefined);
    adminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', role: 'Therapist' },
    ];

    await act(async () => {
      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Therapist')).toBeInTheDocument();
  });

  it('calls acceptEntry when Accept button is clicked', async () => {
    authStore.checkAuthentication = jest.fn().mockResolvedValue(undefined);
    authStore.isAuthenticated = true;
    authStore.userType = 'Admin';

    adminStore.fetchPendingEntries = jest.fn().mockResolvedValue(undefined);
    adminStore.acceptEntry = jest.fn();
    adminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    await act(async () => {
      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );
    });

    const acceptButton = screen.getByText('Accept');
    fireEvent.click(acceptButton);

    expect(adminStore.acceptEntry).toHaveBeenCalledWith('1');
  });

  it('calls declineEntry when Decline button is clicked and confirmed', async () => {
    authStore.checkAuthentication = jest.fn().mockResolvedValue(undefined);
    authStore.isAuthenticated = true;
    authStore.userType = 'Admin';

    adminStore.fetchPendingEntries = jest.fn().mockResolvedValue(undefined);
    adminStore.declineEntry = jest.fn();
    adminStore.pendingEntries = [
      { id: '1', name: 'Test User', email: 'test@example.com', type: 'Therapist' },
    ];

    // Mock window.confirm to always return true
    global.confirm = jest.fn(() => true);

    await act(async () => {
      render(
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      );
    });

    const declineButton = screen.getByText('Decline');
    fireEvent.click(declineButton);

    expect(adminStore.declineEntry).toHaveBeenCalledWith('1');
  });
});
