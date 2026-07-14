import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ManualWeightSheetProps {
  open: boolean;
  dateLabel: string;
  onClose: () => void;
  onSubmit: (weightKg: number, date: string) => Promise<void>;
}

const ManualWeightSheet: React.FC<ManualWeightSheetProps> = ({
  open,
  dateLabel,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [entryDate, setEntryDate] = useState(today);
  const [weightInput, setWeightInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntryDate(format(new Date(), 'yyyy-MM-dd'));
      setWeightInput('');
      setError('');
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (isSubmitting) return;
    if (weightInput.trim() === '' || isNaN(Number(weightInput))) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(Number(weightInput), entryDate);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failedSave'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="bottom" className="flex flex-col min-h-[500px]">
        <SheetHeader>
          <SheetTitle>{t('WeightLabel')}</SheetTitle>
          <SheetDescription>{dateLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 items-center justify-center">
          <Field className="w-fit gap-1">
            <FieldLabel htmlFor="weight-entry-date" className="font-medium text-lg text-zinc-600">
              {t('Date')}
            </FieldLabel>
            <Input
              id="weight-entry-date"
              type="date"
              max={today}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="h-14 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium text-xl shadow-none"
            />
          </Field>
          <Field className="w-fit flex flex-row items-center gap-3">
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="25"
              max="400"
              placeholder="0"
              onChange={(e) => setWeightInput(e.target.value)}
              className="h-20 !w-40 rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
            />
            <FieldLabel htmlFor="weight" className="font-bold text-2xl text-zinc-300">
              {t('WeightUnit')}
            </FieldLabel>
          </Field>
        </div>

        {error && <Alert variant="danger">{t(error)}</Alert>}

        <SheetFooter>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {t('Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ManualWeightSheet;
