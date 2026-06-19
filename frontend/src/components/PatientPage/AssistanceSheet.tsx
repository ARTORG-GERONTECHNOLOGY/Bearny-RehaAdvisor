import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AssistanceSheetProps {
  open: boolean;
  onSelect: (mode: 'alone' | 'with_help') => void;
}

const AssistanceSheet: React.FC<AssistanceSheetProps> = ({ open, onSelect }) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open}>
      <SheetContent side="bottom" className="flex flex-col min-h-[300px]">
        <SheetHeader>
          <SheetTitle>{t('assistanceQuestion')}</SheetTitle>
          <SheetDescription>{t('assistanceDescription')}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-1 py-6">
          <Button
            className="w-full sm:w-48 h-16 text-lg"
            variant="outline"
            onClick={() => onSelect('alone')}
          >
            {t('assistanceAlone')}
          </Button>
          <Button className="w-full sm:w-48 h-16 text-lg" onClick={() => onSelect('with_help')}>
            {t('assistanceWithHelp')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AssistanceSheet;
