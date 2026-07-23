// src/components/TherapistInterventionPage/AddInterventionRow.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { FaPlus, FaFileImport } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

type Props = {
  onAdd: () => void;
  onImport: () => void;
};

const AddInterventionRow: React.FC<Props> = ({ onAdd, onImport }) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div className="flex gap-2">
        <Button size="dashboard" onClick={onAdd}>
          <FaPlus />
          {t('Add New Intervention')}
        </Button>

        <Button size="dashboard" variant="secondary" onClick={onImport}>
          <FaFileImport />
          {t('Import')}
        </Button>
      </div>
    </div>
  );
};

export default AddInterventionRow;
