// buildPatientHealthPdf pulls in jsPDF (ESM, real binary output) — stub the whole module so
// this hook test stays about the hook's orchestration (fetch → build → save), not PDF internals
// (those are covered by patientHealthExport.test.ts).
const saveMock = jest.fn();
const buildPatientHealthPdfMock = jest.fn().mockReturnValue({ save: saveMock });
jest.mock('@/utils/patientHealthExport', () => ({
  buildPatientHealthPdf: (...args: unknown[]) => buildPatientHealthPdfMock(...args),
}));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import { renderHook, waitFor, act } from '@testing-library/react';
import { usePatientHealthExport } from '@/hooks/usePatientHealthExport';
import apiClient from '@/api/client';

const from = new Date(2026, 2, 1); // 2026-03-01
const to = new Date(2026, 2, 7); // 2026-03-07
const selections = { steps: true, activeMinutes: true, sleep: true, bloodPressure: true };

describe('usePatientHealthExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('openModal shows the modal and clears any previous error', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({ response: { data: { detail: 'boom' } } });
    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    await act(async () => {
      await result.current.runExport(from, to, selections);
    });
    expect(result.current.error).toBe('boom');

    act(() => {
      result.current.openModal();
    });

    expect(result.current.showModal).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('closeModal hides the modal', () => {
    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    act(() => {
      result.current.openModal();
    });
    expect(result.current.showModal).toBe(true);

    act(() => {
      result.current.closeModal();
    });
    expect(result.current.showModal).toBe(false);
  });

  it('does nothing when patientId is null', async () => {
    const { result } = renderHook(() => usePatientHealthExport(null));

    await act(async () => {
      await result.current.runExport(from, to, selections);
    });

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(buildPatientHealthPdfMock).not.toHaveBeenCalled();
  });

  it('is exporting while the fetch is in flight, and not once it settles', async () => {
    let resolveFetch!: (v: unknown) => void;
    (apiClient.get as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    let exportPromise!: Promise<void>;
    act(() => {
      exportPromise = result.current.runExport(from, to, selections);
    });

    await waitFor(() => expect(result.current.exporting).toBe(true));

    await act(async () => {
      resolveFetch({ data: { fitbit: [], questionnaire: [], adherence: [] } });
      await exportPromise;
    });

    expect(result.current.exporting).toBe(false);
  });

  it('fetches the combined history for the given patient/date range', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { fitbit: [], questionnaire: [], adherence: [] },
    });
    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    await act(async () => {
      await result.current.runExport(from, to, selections);
    });

    expect(apiClient.get).toHaveBeenCalledWith('/patients/health-combined-history/patient-1/', {
      params: { from: '2026-03-01', to: '2026-03-07' },
    });
  });

  it('builds and saves the PDF with the expected filename, then closes the modal', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { fitbit: [], questionnaire: [], adherence: [] },
    });
    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    act(() => {
      result.current.openModal();
    });

    await act(async () => {
      await result.current.runExport(from, to, selections);
    });

    expect(buildPatientHealthPdfMock).toHaveBeenCalledWith(
      expect.anything(),
      from,
      to,
      selections,
      expect.any(Function)
    );
    expect(saveMock).toHaveBeenCalledWith('HealthData_2026-03-01_to_2026-03-07.pdf');
    expect(result.current.showModal).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('surfaces the backend error message and keeps the modal open on fetch failure', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue({
      response: { data: { detail: 'Backend unavailable' } },
    });
    const { result } = renderHook(() => usePatientHealthExport('patient-1'));

    act(() => {
      result.current.openModal();
    });

    await act(async () => {
      await result.current.runExport(from, to, selections);
    });

    expect(result.current.error).toBe('Backend unavailable');
    expect(result.current.showModal).toBe(true);
    expect(buildPatientHealthPdfMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
