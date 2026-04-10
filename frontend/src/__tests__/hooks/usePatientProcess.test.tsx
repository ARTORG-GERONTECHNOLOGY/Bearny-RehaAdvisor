import { renderHook, waitFor, act } from '@testing-library/react';
import { usePatientProcess } from '@/hooks/usePatientProcess';
import apiClient from '@/api/client';
import { usePatientAuthGate } from '@/hooks/usePatientAuthGate';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('@/hooks/usePatientAuthGate', () => ({
  usePatientAuthGate: jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: '',
  },
}));

const mockedUsePatientAuthGate = usePatientAuthGate as jest.Mock;

describe('usePatientProcess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-16T12:00:00Z').getTime());
    localStorage.clear();
    localStorage.setItem('id', 'patient-123');
    mockedUsePatientAuthGate.mockReturnValue({ isAllowed: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not fetch when patient auth gate is not allowed', async () => {
    mockedUsePatientAuthGate.mockReturnValue({ isAllowed: false });

    const { result } = renderHook(() => usePatientProcess());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result.current.error).toBe('');
  });

  it('fetches and computes process metrics for the weekly range', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/patients/health-combined-history/')) {
        return Promise.resolve({
          data: {
            adherence: [
              { scheduled: 10, completed: 8 },
              { scheduled: 3, completed: 1 },
            ],
          },
        });
      }

      if (url.includes('/fitbit/summary/')) {
        return Promise.resolve({
          data: {
            thresholds: {
              steps_goal: 6000,
              active_minutes_green: 120,
              sleep_green_min: 420,
              bp_sys_green_max: 125,
              bp_dia_green_max: 85,
            },
            period: {
              averages: {
                steps: 7000,
                active_minutes: 135,
                sleep_minutes: 450,
                bp_sys: 120,
                bp_dia: 80,
              },
              daily: [
                {
                  date: '2026-03-16',
                  steps: 8000,
                  active_minutes: 160,
                  sleep_minutes: 480,
                  bp_sys: 121,
                  bp_dia: 79,
                },
              ],
            },
          },
        });
      }

      return Promise.reject(new Error('Unexpected endpoint'));
    });

    const { result } = renderHook(() => usePatientProcess());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/patients/health-combined-history/patient-123/',
      {
        params: { from: '2026-03-10', to: '2026-03-16' },
      }
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/fitbit/summary/patient-123/', {
      params: { days: 7 },
    });

    expect(result.current.dailyMetrics).toHaveLength(7);
    expect(result.current.dailyMetrics[0]).toMatchObject({
      date: '03-10',
      steps: 0,
      activeMinutes: 0,
      sleepMinutes: 0,
      bpSys: null,
      bpDia: null,
    });
    expect(result.current.dailyMetrics[6]).toMatchObject({
      date: '03-16',
      steps: 8000,
      activeMinutes: 160,
      sleepMinutes: 480,
      bpSys: 121,
      bpDia: 79,
    });

    expect(result.current.adherenceTotals).toEqual({ completed: 9, uncompleted: 4 });
    expect(result.current.averageMetrics).toMatchObject({
      steps: 7000,
      activeMinutesLabel: '2h 15min',
      sleepMinutesLabel: '7h 30min',
      bpSys: 120,
      bpDia: 80,
      recommendationsPct: 69,
    });
    expect(result.current.chartThresholds).toEqual({
      steps: 6000,
      activeMinutes: 120,
      sleepMinutes: 420,
      bpSysMax: 125,
      bpDiaMax: 85,
    });
    expect(result.current.isReachedStatus).toEqual({
      steps: true,
      activeMinutes: true,
      sleepMinutes: true,
      bloodPressure: true,
    });
    expect(result.current.chartYMax.steps).toBe(8800);
  });

  it('updates query window when switching to month filter', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { adherence: [], period: { daily: [], averages: {} }, thresholds: {} },
    });

    const { result } = renderHook(() => usePatientProcess());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setProcessFilter('month');
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/fitbit/summary/patient-123/', {
        params: { days: 30 },
      });
    });

    expect(result.current.processFilter).toBe('month');
    expect(result.current.dailyMetrics).toHaveLength(30);
  });

  it('surfaces backend error message on request failure', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({
      response: { data: { detail: 'Backend unavailable' } },
    });

    const { result } = renderHook(() => usePatientProcess());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Backend unavailable');
    expect(result.current.dailyMetrics).toHaveLength(7);
    expect(result.current.adherenceTotals).toEqual({ completed: 0, uncompleted: 0 });
    expect(result.current.chartThresholds).toEqual({
      steps: null,
      activeMinutes: null,
      sleepMinutes: null,
      bpSysMax: null,
      bpDiaMax: null,
    });
    expect(result.current.isReachedStatus).toEqual({
      steps: null,
      activeMinutes: null,
      sleepMinutes: null,
      bloodPressure: null,
    });
  });
});
