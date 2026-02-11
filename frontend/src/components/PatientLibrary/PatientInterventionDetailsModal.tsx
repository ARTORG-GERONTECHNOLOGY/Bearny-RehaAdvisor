// src/pages/patient-library/PatientInterventionDetailsModal.tsx
import React from 'react';
import PatientInterventionPopUp from '../../components/PatientPage/PatientInterventionPopUp';
import type { InterventionTypeTh } from '../../types';
import { getAllMedia, type InterventionMedia } from '../../utils/interventions';

type Props = {
  item: InterventionTypeTh | null;
  show: boolean;
  onClose: () => void;
};

// ✅ Adapt NEW model -> Patient popup item
// Notes:
// - `aims` is NOT part of tags (tags exclude aims)
// - media is now a list (external + file). Patient popup will render the first playable,
//   and also show a list selector if multiple media exist (implemented below).
const toPatientPopupItem = (it: InterventionTypeTh) => {
  const mediaList: InterventionMedia[] = getAllMedia(it as any);

  return {
    id: (it as any)?._id,
    title: it.title,
    intervention_title: it.title,
    content_type: (it as any).content_type ?? (it as any).contentType ?? '',
    description: it.description,

    // ✅ NEW fields
    language: (it as any).language ?? '',
    external_id: (it as any).external_id ?? (it as any).externalId ?? '',
    provider: (it as any).provider ?? '',

    // taxonomy split
    aims: (it as any).aims || [],
    tags: (it as any).tags || [],
    preview_img: (it as any).preview_img ?? (it as any).previewImage ?? (it as any).img_url ?? '',

    // ✅ NEW: full media list
    media: mediaList,

    // legacy fallbacks (keep if backend still sends them)
    link: (it as any).link ?? '',
    media_file: (it as any).media_file ?? '',
    media_url: (it as any).media_url ?? '',
    benefitFor: (it as any).benefitFor || [],

    // therapist notes/instructions (if present in your new model)
    notes: (it as any).notes ?? '',
  };
};

const PatientInterventionDetailsModal: React.FC<Props> = ({ item, show, onClose }) => {
  if (!item) return null;

  return <PatientInterventionPopUp show={show} handleClose={onClose} item={toPatientPopupItem(item)} />;
};

export default PatientInterventionDetailsModal;
