// src/components/TherapistPatientPage/FlagActions.tsx
import React from 'react';
import { Flag, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import type { PatientType } from '@/types';
import type { TherapistPatientsStore } from '@/stores/therapistPatientsStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fmtDateTime, getPatientMongoId } from '@/utils/patientStatus';

type Props = {
  patient: PatientType;
  store: TherapistPatientsStore;
};

const FlagActions: React.FC<Props> = observer(({ patient, store }) => {
  const { t } = useTranslation();
  const mongoId = getPatientMongoId(patient);

  const flagTip = patient.flagged
    ? [
        t('Unflag patient'),
        [patient.flagged_by, patient.flagged_at ? fmtDateTime(patient.flagged_at) : '']
          .filter(Boolean)
          .join(' • '),
      ]
        .filter(Boolean)
        .join('\n')
    : String(t('Flag patient'));

  return (
    <div className="flex items-center justify-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={String(patient.flagged ? t('Unflag patient') : t('Flag patient'))}
            aria-pressed={!!patient.flagged}
            disabled={store.togglingFlagIds.has(mongoId)}
            onClick={(e) => {
              e.stopPropagation();
              void store.toggleFlag(patient, t);
            }}
            className={`p-1 rounded hover:bg-back disabled:opacity-50 ${
              patient.flagged ? 'text-nok' : 'text-muted-foreground'
            }`}
          >
            <Flag className="h-4 w-4" fill={patient.flagged ? 'currentColor' : 'none'} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line">{flagTip}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={String(t('View comments'))}
            onClick={(e) => {
              e.stopPropagation();
              store.openFlagComments(patient, t);
            }}
            className="p-1 rounded hover:bg-back text-muted-foreground"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{String(t('View comments'))}</TooltipContent>
      </Tooltip>
    </div>
  );
});

export default FlagActions;
