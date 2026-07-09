import { renderHook, waitFor, act } from '@testing-library/react';
import { usePatientProcess } from '@/hooks/usePatientProcess';
import apiClient from '@/api/client';
import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
import { colors } from '@/lib/colors';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock('@/hooks/useRoleAuthGate', () => ({
  useRoleAuthGate: jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    id: '',
    getStoredUserId: jest.fn(function (this: { id: string }) {
      return this.id || localStorage.getItem('id') || '';
    }),
  },
}));

const mockedUseRoleAuthGate = useRoleAuthGate as jest.Mock;

describe('usePatientProcess', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-16T12:00:00Z').getTime());
    localStorage.clear();
    localStorage.setItem('id', 'patient-123');
    mockedUseRoleAuthGate.mockReturnValue({ isAllowed: true });
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('does not fetch when patient auth gate is not allowed', async () => {
    mockedUseRoleAuthGate.mockReturnValue({ isAllowed: false });

    const { result } = renderHook(() => usePatientProcess());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result.current.error).toBe('');
  });

  it('fetches and computes process metrics for the weekly range', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

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
                  date: todayIso,
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
      expect.objectContaining({
        params: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      })
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/fitbit/summary/patient-123/', {
      params: { days: 7 },
    });

    expect(result.current.dailyMetrics).toHaveLength(7);
    expect(result.current.dailyMetrics[0]).toMatchObject({
      date: expect.stringMatching(/^\d{2}-\d{2}$/),
      steps: 0,
      activeMinutes: 0,
      sleepMinutes: 0,
      bpSys: null,
      bpDia: null,
    });
    // null values (no API data) → all metrics render as muted
    expect(result.current.dailyMetrics[0].colors).toEqual({
      steps: colors.chartMuted,
      activeMinutes: colors.chartMuted,
      sleepMinutes: colors.chartMuted,
      bpSys: colors.chartMuted,
      bpDia: colors.chartMuted,
    });
    expect(result.current.dailyMetrics[6]).toMatchObject({
      date: todayIso.slice(5),
      steps: 8000,
      activeMinutes: 160,
      sleepMinutes: 480,
      bpSys: 121,
      bpDia: 79,
    });
    // all values meet their green thresholds → all brand color
    expect(result.current.dailyMetrics[6].colors).toEqual({
      steps: colors.brand,
      activeMinutes: colors.brand,
      sleepMinutes: colors.brand,
      bpSys: colors.brand,
      bpDia: colors.brand,
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
      stepsGreen: 6000,
      activeMinutesGreen: 120,
      activeMinutesYellow: null,
      sleepMinutesGreen: 420,
      sleepMinutesYellow: null,
      bpSysGreenMax: 125,
      bpSysYellowMax: null,
      bpDiaGreenMax: 85,
      bpDiaYellowMax: null,
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

  it('assigns yellow and pink colors for values in and below the yellow threshold range', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/patients/health-combined-history/')) {
        return Promise.resolve({ data: { adherence: [] } });
      }
      if (url.includes('/fitbit/summary/')) {
        return Promise.resolve({
          data: {
            thresholds: {
              steps_goal: 6000,
              active_minutes_green: 120,
              active_minutes_yellow: 60,
              sleep_green_min: 420,
              sleep_yellow_min: 300,
              bp_sys_green_max: 125,
              bp_sys_yellow_max: 140,
              bp_dia_green_max: 85,
              bp_dia_yellow_max: 100,
            },
            period: {
              averages: {},
              daily: [
                {
                  date: todayIso,
                  steps: 8000, // >= 6000 green threshold → brand
                  active_minutes: 90, // < 120 green, >= 60 yellow → yellow
                  sleep_minutes: 200, // < 420 green, < 300 yellow → pink
                  bp_sys: 130, // > 125 green, <= 140 yellow → yellow
                  bp_dia: 110, // > 85 green, > 100 yellow → pink
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

    const today = result.current.dailyMetrics[6];
    expect(today.colors.steps).toBe(colors.brand);
    expect(today.colors.activeMinutes).toBe(colors.yellow);
    expect(today.colors.sleepMinutes).toBe(colors.pink);
    expect(today.colors.bpSys).toBe(colors.yellow);
    expect(today.colors.bpDia).toBe(colors.pink);
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
  });
});
