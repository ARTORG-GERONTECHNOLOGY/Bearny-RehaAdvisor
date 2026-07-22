import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Alert } from '@/components/ui/alert';
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

interface RescheduleInterventionSheetProps {
  open: boolean;
  currentDate: Date | null;
  titleLabel: string;
  onClose: () => void;
  onSubmit: (newDate: Date) => Promise<void>;
}

const RescheduleInterventionSheet: React.FC<RescheduleInterventionSheetProps> = ({
  open,
  currentDate,
  titleLabel,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [entryDate, setEntryDate] = useState(today);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && currentDate) {
      setEntryDate(format(currentDate, 'yyyy-MM-dd'));
      setError('');
      setIsSubmitting(false);
    }
  }, [open, currentDate]);

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!entryDate || !currentDate) return;

    // Keep the original time of day — only the date changes.
    const newDate = new Date(currentDate);
    const [year, month, day] = entryDate.split('-').map(Number);
    newDate.setFullYear(year, month - 1, day);
    if (Number.isNaN(newDate.getTime())) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(newDate);
      onClose();
    } catch (e: any) {
      const backendMessage = e?.response?.data?.message;
      setError(backendMessage || (e instanceof Error ? e.message : t('failedReschedule')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="bottom" className="flex flex-col min-h-[400px]">
        <SheetHeader>
          <SheetTitle>{t('Reschedule')}</SheetTitle>
          <SheetDescription>{titleLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 items-center justify-center">
          <Field className="w-fit gap-1">
            <FieldLabel htmlFor="reschedule-date" className="font-medium text-lg text-zinc-600">
              {t('Date')}
            </FieldLabel>
            <Input
              id="reschedule-date"
              type="date"
              min={today}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="h-14 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium text-xl shadow-none"
            />
          </Field>
        </div>

        {error && <Alert variant="destructive">{t(error)}</Alert>}

        <SheetFooter>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {t('Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default RescheduleInterventionSheet;
