import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import { FaFilePdf } from 'react-icons/fa';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert } from '@/components/ui/alert';
import { datePickerInputClassName } from '@/components/ui/input';
import type { PatientExportMetric } from '@/utils/patientHealthExport';

type Props = {
  show: boolean;
  onClose: () => void;
  initialFrom: Date;
  initialTo: Date;
  exporting: boolean;
  error?: string;
  onExport: (from: Date, to: Date, selections: Record<PatientExportMetric, boolean>) => void;
};

const METRIC_IDS: PatientExportMetric[] = ['steps', 'activeMinutes', 'sleep', 'bloodPressure'];

const DEFAULT_CHOSEN: Record<PatientExportMetric, boolean> = {
  steps: true,
  activeMinutes: true,
  sleep: true,
  bloodPressure: true,
};

const PatientExportModal: React.FC<Props> = ({
  show,
  onClose,
  initialFrom,
  initialTo,
  exporting,
  error,
  onExport,
}) => {
  const { t } = useTranslation();

  const METRIC_LABELS: Record<PatientExportMetric, string> = {
    steps: t('Steps'),
    activeMinutes: t('Active Minutes'),
    sleep: t('Sleep'),
    bloodPressure: t('Blood pressure'),
  };

  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [chosen, setChosen] = useState<Record<PatientExportMetric, boolean>>(DEFAULT_CHOSEN);

  useEffect(() => {
    if (show) {
      setFrom(initialFrom);
      setTo(initialTo);
      setChosen(DEFAULT_CHOSEN);
    }
  }, [show, initialFrom, initialTo]);

  const invalidRange = !!from && !!to && from.getTime() > to.getTime();
  const disabled =
    !from || !to || invalidRange || exporting || !Object.values(chosen).some(Boolean);

  return (
    <Sheet open={show} onOpenChange={(open) => !open && !exporting && onClose()}>
      <SheetContent side="bottom" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('Export')}</SheetTitle>
          <SheetDescription>
            {t(
              'Export steps, active zone minutes, sleep and blood pressure for the selected time period as a PDF.'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label>{t('From')}</Label>
            <DatePicker
              selected={from}
              onChange={(d: Date | null) => setFrom(d)}
              className={datePickerInputClassName}
              portalId="datepicker-portal"
              popperClassName="!z-[60] !pointer-events-auto"
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t('To')}</Label>
            <DatePicker
              selected={to}
              onChange={(d: Date | null) => setTo(d)}
              className={datePickerInputClassName}
              portalId="datepicker-portal"
              popperClassName="!z-[60] !pointer-events-auto"
              dateFormat="yyyy-MM-dd"
            />
          </div>
        </div>

        <Separator className="my-4" />

        <Label className="font-bold">{t('Select Plots to Export')}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {METRIC_IDS.map((id) => {
            const toggle = () => setChosen((p) => ({ ...p, [id]: !p[id] }));
            return (
              <Badge
                key={id}
                role="button"
                tabIndex={0}
                aria-pressed={chosen[id]}
                className={`cursor-pointer ${
                  chosen[id] ? 'bg-brand text-white' : 'border border-brand bg-white text-brand'
                }`}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                }}
              >
                {METRIC_LABELS[id]}
              </Badge>
            );
          })}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <SheetFooter>
          <Button disabled={disabled} onClick={() => from && to && onExport(from, to, chosen)}>
            <FaFilePdf />
            {exporting ? t('Exporting...') : t('Export PDF')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default PatientExportModal;
