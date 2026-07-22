import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import { FaFileCsv, FaFilePdf } from 'react-icons/fa';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type Props = {
  show: boolean;
  onClose: () => void;

  // initial values (used to prefill when the modal opens)
  initialFrom: Date | null;
  initialTo: Date | null;
  selections: Record<string, boolean>;

  // call back to the page with the chosen settings
  onExportCSV: (from: Date, to: Date, selections: Record<string, boolean>) => void;
  onExportPDF: (from: Date, to: Date, selections: Record<string, boolean>) => void;
};

const ExportModal: React.FC<Props> = ({
  show,
  onClose,
  initialFrom,
  initialTo,
  selections,
  onExportCSV,
  onExportPDF,
}) => {
  const { t } = useTranslation();

  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [chosen, setChosen] = useState<Record<string, boolean>>(selections);

  // reset local state when the modal opens
  useEffect(() => {
    if (show) {
      setFrom(initialFrom);
      setTo(initialTo);
      setChosen(selections);
    }
  }, [show, initialFrom, initialTo, selections]);

  // Ordered to match the card layout on the Health page (HealthMetricsCards.tsx):
  // Engagement, Cardiovascular, Activity, Sleep & Recovery.
  const ids = [
    'adherence',
    'wearTime',
    'questionnaire',
    'totalScore',
    'restingHR',
    'bloodPressure',
    'hrZones',
    'steps',
    'activeMinutes',
    'weight',
    'exercise',
    'sleep',
    'breathing',
  ];

  const allSelected = Object.values(chosen).every(Boolean);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    ids.forEach((id) => (next[id] = !allSelected));
    setChosen(next);
  };

  const disabled = !from || !to;

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('Export')}</DialogTitle>
          <DialogDescription>
            {t('Export date range only affects the files; it does not change the charts.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="font-bold mr-2">{t('From')}</Label>
            <DatePicker
              selected={from}
              onChange={(d) => setFrom(d)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="font-bold mr-2">{t('To')}</Label>
            <DatePicker
              selected={to}
              onChange={(d) => setTo(d)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              dateFormat="yyyy-MM-dd"
            />
          </div>
        </div>

        <hr className="my-4" />

        <Label className="font-bold">{t('Select Plots to Export')}</Label>
        <div className="mb-1">
          <Badge
            className={`cursor-pointer ${allSelected ? 'bg-brand text-white' : 'border border-brand bg-white text-brand'}`}
            onClick={toggleAll}
          >
            {t('Select All')}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {ids.map((id) => (
            <Badge
              key={id}
              className={`cursor-pointer ${
                chosen[id] ? 'bg-pink text-white' : 'border border-pink bg-white text-pink'
              }`}
              onClick={() => setChosen((p) => ({ ...p, [id]: !p[id] }))}
            >
              {t(id)}
            </Badge>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button size="dashboard" variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <div className="flex gap-2">
            <Button
              size="dashboard"
              disabled={disabled}
              onClick={() => from && to && onExportCSV(from, to, chosen)}
            >
              <FaFileCsv />
              {t('Export CSV')}
            </Button>
            <Button
              size="dashboard"
              disabled={disabled}
              onClick={() => from && to && onExportPDF(from, to, chosen)}
            >
              <FaFilePdf />
              {t('Export PDF')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportModal;
