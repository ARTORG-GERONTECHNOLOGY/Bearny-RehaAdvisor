import { renderHook, act } from '@testing-library/react';
import { useInterventionPopup } from '@/hooks/useInterventionPopup';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import type { PatientRec } from '@/stores/patientInterventionsStore';

jest.mock('@/stores/patientQuestionnairesStore', () => ({
  patientQuestionnairesStore: {
    showFeedbackPopup: false,
    showHealthPopup: false,
    closeFeedback: jest.fn(),
    closeHealth: jest.fn(),
  },
}));

const mockRec: PatientRec = { _id: 'rec-1' } as unknown as PatientRec;

describe('useInterventionPopup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    patientQuestionnairesStore.showFeedbackPopup = false;
    patientQuestionnairesStore.showHealthPopup = false;
  });

  it('starts with no selected intervention', () => {
    const { result } = renderHook(() => useInterventionPopup());
    expect(result.current.selectedIntervention).toBeNull();
  });

  it('sets selected intervention when openIntervention is called', () => {
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });

    expect(result.current.selectedIntervention).toBe(mockRec);
  });

  it('clears selected intervention when closeIntervention is called', () => {
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });
    act(() => {
      result.current.closeIntervention();
    });

    expect(result.current.selectedIntervention).toBeNull();
  });

  it('closes feedback popup if open when opening an intervention', () => {
    patientQuestionnairesStore.showFeedbackPopup = true;
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });

    expect(patientQuestionnairesStore.closeFeedback).toHaveBeenCalledTimes(1);
  });

  it('closes health popup if open when opening an intervention', () => {
    patientQuestionnairesStore.showHealthPopup = true;
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });

    expect(patientQuestionnairesStore.closeHealth).toHaveBeenCalledTimes(1);
  });

  it('does not call closeFeedback when feedback popup is not open', () => {
    patientQuestionnairesStore.showFeedbackPopup = false;
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });

    expect(patientQuestionnairesStore.closeFeedback).not.toHaveBeenCalled();
  });

  it('does not call closeHealth when health popup is not open', () => {
    patientQuestionnairesStore.showHealthPopup = false;
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });

    expect(patientQuestionnairesStore.closeHealth).not.toHaveBeenCalled();
  });

  it('replaces selected intervention when called multiple times', () => {
    const secondRec: PatientRec = { _id: 'rec-2' } as unknown as PatientRec;
    const { result } = renderHook(() => useInterventionPopup());

    act(() => {
      result.current.openIntervention(mockRec);
    });
    act(() => {
      result.current.openIntervention(secondRec);
    });

    expect(result.current.selectedIntervention).toBe(secondRec);
  });
});
