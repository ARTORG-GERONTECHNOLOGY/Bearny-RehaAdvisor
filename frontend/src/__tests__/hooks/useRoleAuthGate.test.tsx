import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
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

describe('useRoleAuthGate', () => {
  it('initially returns authChecked=false and isAllowed=false', () => {
    (authStore.checkAuthentication as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    expect(result.current.authChecked).toBe(false);
    expect(result.current.isAllowed).toBe(false);
  });

  it('sets authChecked=true after checkAuthentication resolves', async () => {
    const { result } = renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => expect(result.current.authChecked).toBe(true));
  });

  it('navigates to "/" by default when not authenticated', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('navigates when authenticated but with the wrong role', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Patient';
    renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('does not navigate when authenticated with the matching role', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Therapist';
    renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled());
  });

  it('returns isAllowed=true when authenticated with the matching role', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Therapist';
    const { result } = renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => {
      expect(result.current.authChecked).toBe(true);
      expect(result.current.isAllowed).toBe(true);
    });
  });

  it('returns isAllowed=false when not authenticated after check', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    const { result } = renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    await waitFor(() => expect(result.current.authChecked).toBe(true));
    expect(result.current.isAllowed).toBe(false);
  });

  it('respects a custom redirectTo target', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    renderHook(() => useRoleAuthGate('Therapist', '/unauthorized'), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/unauthorized'));
  });

  it('with no role given, allows any authenticated role through', async () => {
    authStore.isAuthenticated = true;
    authStore.userType = 'Researcher';
    const { result } = renderHook(() => useRoleAuthGate(), { wrapper });
    await waitFor(() => {
      expect(result.current.isAllowed).toBe(true);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('with no role given, still redirects an unauthenticated user', async () => {
    authStore.isAuthenticated = false;
    authStore.userType = '';
    renderHook(() => useRoleAuthGate(), { wrapper });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('does not call setAuthChecked after unmount', async () => {
    let resolveAuth!: () => void;
    (authStore.checkAuthentication as jest.Mock).mockReturnValue(
      new Promise<void>((r) => {
        resolveAuth = r;
      })
    );
    const { result, unmount } = renderHook(() => useRoleAuthGate('Therapist'), { wrapper });
    unmount();
    await act(async () => {
      resolveAuth();
    });
    // authChecked should remain false since the component was unmounted
    expect(result.current.authChecked).toBe(false);
  });
});
