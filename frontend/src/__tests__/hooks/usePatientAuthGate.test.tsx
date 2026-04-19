import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usePatientAuthGate } from '@/hooks/usePatientAuthGate';
import authStore from '@/stores/authStore';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: false,
    userType: '',
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

beforeEach(() => {
  mockNavigate.mockReset();
  (authStore.checkAuthentication as jest.Mock).mockResolvedValue(undefined);
  authStore.isAuthenticated = false;
  authStore.userType = '';
});

describe('usePatientAuthGate', () => {
  it('initially returns authChecked=false and isAllowed=false', () => {
    (authStore.checkAuthentication as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePatientAuthGate(), { wrapper });
    expect(result.current.authChecked).toBe(false);
    expect(result.current.isAllowed).toBe(false);
  });

  it('sets authChecked=true after checkAuthentication resolves', async () => {
    const { result } = renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(result.current.authChecked).toBe(true));
  });

  it('navigates to "/" when not authenticated', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('navigates to "/" when authenticated but not a Patient', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Therapist';
    renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('does not navigate when authenticated as Patient', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Patient';
    renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  });

  it('returns isAllowed=true when authenticated as Patient', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Patient';
    const { result } = renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true);
      expect(result.current.isAllowed).toBe(true);
    });
  });

  it('returns isAllowed=false when not authenticated after check', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    const { result } = renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(result.current.authChecked).toBe(true));
    expect(result.current.isAllowed).toBe(false);
  });

  it('still sets authChecked=true when checkAuthentication returns nothing', async () => {
    // Covers the finally branch — checkAuthentication resolves with no value
    (authStore.checkAuthentication as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => usePatientAuthGate(), { wrapper });
    await waitFor(() => expect(result.current.authChecked).toBe(true));
  });

  it('does not call setAuthChecked after unmount', async () => {
    let resolveAuth!: () => void;
    (authStore.checkAuthentication as jest.Mock).mockReturnValue(
      new Promise<void>((r) => {
        resolveAuth = r;
      })
    );
    const { result, unmount } = renderHook(() => usePatientAuthGate(), { wrapper });
    unmount();
    await act(async () => {
      resolveAuth();
    });
    // authChecked should remain false since the component was unmounted
    expect(result.current.authChecked).toBe(false);
  });
});
