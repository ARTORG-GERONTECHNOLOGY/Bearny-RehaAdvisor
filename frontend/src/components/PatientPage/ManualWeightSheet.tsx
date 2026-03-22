import React from 'react';
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
  error: string;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}

const ManualWeightSheet: React.FC<ManualWeightSheetProps> = ({
  open,
  dateLabel,
  error,
  onClose,
  onChange,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="bottom" className="flex flex-col min-h-[500px]">
        <SheetHeader>
          <SheetTitle>{t('WeightLabel')}</SheetTitle>
          <SheetDescription>{dateLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 items-center justify-center">
          <Field className="w-fit flex flex-row items-center gap-3">
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="25"
              max="400"
              placeholder="0"
              onChange={(e) => onChange(e.target.value)}
              className="h-20 !w-40 rounded-3xl border-none bg-zinc-100 py-1 px-6 font-medium !text-4xl placeholder:text-zinc-300 shadow-none"
            />
            <FieldLabel htmlFor="weight" className="font-bold text-2xl text-zinc-300">
              Kg
            </FieldLabel>
          </Field>
        </div>

        {error && <Alert variant="danger">{t(error)}</Alert>}

        <SheetFooter>
          <Button
            onClick={onSave}
            className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-lg font-medium text-zinc-50"
          >
            {t('Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ManualWeightSheet;
