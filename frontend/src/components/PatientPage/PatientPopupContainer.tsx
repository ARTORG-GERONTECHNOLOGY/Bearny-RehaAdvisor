import React from 'react';
import { observer } from 'mobx-react-lite';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import FeedbackPopup from './FeedbackPopup';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import type { PatientRec } from '@/stores/patientInterventionsStore';

interface PatientPopupContainerProps {
  selectedIntervention: PatientRec | null;
  onCloseIntervention: () => void;
}

/**
 * Shared component for rendering intervention-related popups
 * Used by both Patient home page and PatientPlan page
 * Handles: intervention detail popup and intervention feedback popup
 */
const PatientPopupContainer: React.FC<PatientPopupContainerProps> = observer(
  ({ selectedIntervention, onCloseIntervention }) => {
    // Safe questions array
    const safeInterventionQuestions = Array.isArray(patientQuestionnairesStore.feedbackQuestions)
      ? patientQuestionnairesStore.feedbackQuestions
      : [];

    // Close feedback popup
    const closeFeedback = () => {
      patientQuestionnairesStore.closeFeedback();
    };

    return (
      <>
        {/* Intervention Detail Popup */}
        {selectedIntervention && !patientQuestionnairesStore.showFeedbackPopup && (
          <PatientInterventionPopUp
            show
            item={selectedIntervention}
            handleClose={onCloseIntervention}
          />
        )}

        {/* Intervention Feedback Popup */}
        {patientQuestionnairesStore.showFeedbackPopup && (
          <FeedbackPopup
            show
            interventionId={patientQuestionnairesStore.feedbackInterventionId || ''}
            questions={safeInterventionQuestions}
            date={patientQuestionnairesStore.feedbackDateKey}
            onClose={closeFeedback}
          />
        )}
      </>
    );
  }
);

export default PatientPopupContainer;
