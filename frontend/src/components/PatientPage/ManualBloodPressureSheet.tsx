import React, { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ManualBloodPressureSheetProps {
  open: boolean;
  dateLabel: string;
  onClose: () => void;
  onSubmit: (bpSys: number, bpDia: number) => Promise<void>;
}

const ManualBloodPressureSheet: React.FC<ManualBloodPressureSheetProps> = ({
  open,
  dateLabel,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [bpSysInput, setBpSysInput] = useState('');
  const [bpDiaInput, setBpDiaInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setBpSysInput('');
      setBpDiaInput('');
      setError('');
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (isSubmitting) return;
    if (bpSysInput.trim() === '' || isNaN(Number(bpSysInput))) return;
    if (bpDiaInput.trim() === '' || isNaN(Number(bpDiaInput))) return;

    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(Number(bpSysInput), Number(bpDiaInput));
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
          <SheetTitle>{t('Blood pressure')}</SheetTitle>
          <SheetDescription>{dateLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex flex-col gap-4">
            <Field className="w-fit gap-1">
              <FieldLabel htmlFor="systolic" className="font-medium text-lg text-zinc-600">
                {t('Systolic (mmHg)')}
              </FieldLabel>
              <Input
                id="systolic"
                type="number"
                inputMode="numeric"
                step="1"
                min="60"
                max="250"
                placeholder="120"
                onChange={(e) => setBpSysInput(e.target.value)}
                className="h-20 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldDescription className="text-sm text-zinc-500">
                {t('systolicHint')}
              </FieldDescription>
            </Field>
            <Field className="w-fit gap-1">
              <FieldLabel htmlFor="diastolic" className="font-medium text-lg text-zinc-600">
                {t('Diastolic (mmHg)')}
              </FieldLabel>
              <Input
                id="diastolic"
                type="number"
                inputMode="numeric"
                step="1"
                min="40"
                max="150"
                placeholder="80"
                onChange={(e) => setBpDiaInput(e.target.value)}
                className="h-20 !w-[200px] rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
              />
              <FieldDescription className="text-sm text-zinc-500">
                {t('diastolicHint')}
              </FieldDescription>
            </Field>
          </div>
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

export default ManualBloodPressureSheet;
