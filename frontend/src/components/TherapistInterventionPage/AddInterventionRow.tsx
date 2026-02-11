// src/components/TherapistInterventionPage/AddInterventionRow.tsx
import React from 'react';
import { Button } from 'react-bootstrap';
import { FaPlus, FaFileImport } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

type Props = {
  onAdd: () => void;
  onImport: () => void;
};

const AddInterventionRow: React.FC<Props> = ({ onAdd, onImport }) => {
  const { t } = useTranslation();

  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div className="d-flex gap-2">
        <Button variant="primary" onClick={onAdd}>
          <FaPlus className="me-2" />
          {t('Add New Intervention')}
        </Button>

        <Button variant="outline-primary" onClick={onImport}>
          <FaFileImport className="me-2" />
          {t('Import')}
        </Button>
      </div>
    </div>
  );
};

export default AddInterventionRow;
