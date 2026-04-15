import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

type OptionItem = {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }> | null;
};

type PatientLibraryFilterSheetProps = {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  typeOptions: OptionItem[];
  contentOptions: OptionItem[];
  aimsFilter: string[];
  setAimsFilter: React.Dispatch<React.SetStateAction<string[]>>;
  contentTypeFilter: string[];
  setContentTypeFilter: React.Dispatch<React.SetStateAction<string[]>>;
  durationFilterIndices: [number, number];
  setDurationFilterIndices: React.Dispatch<React.SetStateAction<[number, number]>>;
  durationLabels: string[];
  ratingFilterIndices: [number, number];
  setRatingFilterIndices: React.Dispatch<React.SetStateAction<[number, number]>>;
  ratingLabels: string[];
  onResetFilters: () => void;
};

const PatientLibraryFilterSheet: React.FC<PatientLibraryFilterSheetProps> = ({
  open,
  onOpenChange,
  typeOptions,
  contentOptions,
  aimsFilter,
  setAimsFilter,
  contentTypeFilter,
  setContentTypeFilter,
  durationFilterIndices,
  setDurationFilterIndices,
  durationLabels,
  ratingFilterIndices,
  setRatingFilterIndices,
  ratingLabels,
  onResetFilters,
}) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('Filter')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-12 flex-1 overflow-y-auto pr-3">
          <div className="flex flex-col gap-4">
            <div className="font-medium text-lg text-zinc-600">{t('Type')}</div>
            <div className="flex flex-col gap-3">
              {typeOptions.map((option) => (
                <div key={option.value} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                    <div className="w-6 h-6 flex items-center justify-center" aria-hidden="true">
                      {option.Icon && <option.Icon className="w-6 h-6" />}
                    </div>
                    <span>{t(option.label)}</span>
                  </div>
                  <Switch
                    checked={aimsFilter.includes(option.value)}
                    onCheckedChange={() =>
                      setAimsFilter((prev) =>
                        prev.includes(option.value)
                          ? prev.filter((v) => v !== option.value)
                          : [...prev, option.value]
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="font-medium text-lg text-zinc-600">{t('Medium')}</div>
            <div className="flex flex-col gap-3">
              {contentOptions.map((option) => (
                <div key={option.value} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                    <div className="w-6 h-6 flex items-center justify-center" aria-hidden="true">
                      {option.Icon && <option.Icon className="w-6 h-6" />}
                    </div>
                    <span>{t(option.label)}</span>
                  </div>
                  <Switch
                    checked={contentTypeFilter.includes(option.value)}
                    onCheckedChange={() =>
                      setContentTypeFilter((prev) =>
                        prev.includes(option.value)
                          ? prev.filter((v) => v !== option.value)
                          : [...prev, option.value]
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="font-medium text-lg text-zinc-600">{t('Duration Short')}</div>
            <Slider
              value={durationFilterIndices}
              min={0}
              max={4}
              step={1}
              onValueChange={(value) => setDurationFilterIndices([value[0], value[1]])}
            />
            <div className="flex justify-between font-medium text-sm text-zinc-400 px-0.5">
              {durationLabels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="font-medium text-lg text-zinc-600">{t('Rating')}</div>
            <Slider
              value={ratingFilterIndices}
              min={0}
              max={4}
              step={1}
              onValueChange={(value) => setRatingFilterIndices([value[0], value[1]])}
            />
            <div className="flex justify-between font-medium text-sm text-zinc-400 px-0.5">
              {ratingLabels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={onResetFilters}>
            {t('Reset filters')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('Apply')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default PatientLibraryFilterSheet;
