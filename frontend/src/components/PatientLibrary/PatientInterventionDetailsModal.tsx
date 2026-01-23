// src/pages/patient-library/PatientInterventionDetailsModal.tsx
import React from 'react';
import PatientInterventionPopUp from '../../components/PatientPage/PatientInterventionPopUp';
import type { InterventionTypeTh } from '../../types';

type Props = {
  item: InterventionTypeTh | null;
  show: boolean;
  onClose: () => void;
};

const toPatientPopupItem = (it: InterventionTypeTh) => ({
  title: it.title,
  intervention_title: it.title,
  content_type: it.content_type,
  description: it.description,
  media_file: it.media_file,
  media_url: it.media_file,
  link: it.link,
  tags: it.tags || [],
  benefitFor: it.benefitFor || [],
  preview_img: it.preview_img,
});

const PatientInterventionDetailsModal: React.FC<Props> = ({ item, show, onClose }) => {
  if (!item) return null;

  return (
    <PatientInterventionPopUp
      show={show}
      handleClose={onClose}
      item={toPatientPopupItem(item)}
    />
  );
};

export default PatientInterventionDetailsModal;
