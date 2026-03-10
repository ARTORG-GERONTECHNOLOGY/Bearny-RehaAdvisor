import { useState, useCallback } from 'react';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import type { PatientRec } from '@/stores/patientInterventionsStore';

/**
 * Custom hook for managing intervention popup state
 * Encapsulates the pattern of opening/closing intervention detail popups
 */
export const useInterventionPopup = () => {
  const [selectedIntervention, setSelectedIntervention] = useState<PatientRec | null>(null);

  const openIntervention = useCallback((rec: PatientRec) => {
    // Close any open questionnaire popups
    if (patientQuestionnairesStore.showFeedbackPopup) {
      patientQuestionnairesStore.closeFeedback();
    }
    if (patientQuestionnairesStore.showHealthPopup) {
      patientQuestionnairesStore.closeHealth();
    }
    setSelectedIntervention(rec);
  }, []);

  const closeIntervention = useCallback(() => {
    setSelectedIntervention(null);
  }, []);

  return {
    selectedIntervention,
    openIntervention,
    closeIntervention,
  };
};
