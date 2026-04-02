import React, { useState } from 'react';
import { SearchIcon, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

type OptionItem = {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }> | null;
};

type PatientLibraryDesktopFiltersProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  typeOptions: OptionItem[];
  contentOptions: OptionItem[];
  aimsFilter: string[];
  setAimsFilter: React.Dispatch<React.SetStateAction<string[]>>;
  contentTypeFilter: string[];
  setContentTypeFilter: React.Dispatch<React.SetStateAction<string[]>>;
  durationFilterIndices: [number, number];
  setDurationFilterIndices: React.Dispatch<React.SetStateAction<[number, number]>>;
  durationLabels: string[];
};

type FilterSectionProps = {
  title: string;
  children: React.ReactNode;
};

const FilterSection: React.FC<FilterSectionProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-3xl border border-accent !px-5 !py-4"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between p-0 text-left font-medium text-lg text-zinc-800 border-none bg-white"
        >
          <span>{title}</span>
          <ChevronDown
            className={`h-[18px] w-[18px] text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const PatientLibraryDesktopFilters: React.FC<PatientLibraryDesktopFiltersProps> = ({
  searchTerm,
  onSearchTermChange,
  typeOptions,
  contentOptions,
  aimsFilter,
  setAimsFilter,
  contentTypeFilter,
  setContentTypeFilter,
  durationFilterIndices,
  setDurationFilterIndices,
  durationLabels,
}) => {
  const { t } = useTranslation();

  return (
    <aside className="hidden lg:block lg:sticky lg:top-24 self-start">
      <div className="rounded-[40px] bg-white p-4">
        <div className="flex flex-col gap-8">
          <Field>
            <InputGroup className="rounded-full border border-accent bg-white h-14 !px-5 !py-4">
              <InputGroupInput
                type="text"
                placeholder={t('Search')}
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                className="p-0 !text-lg font-medium placeholder:text-zinc-400"
              />
              <InputGroupAddon align="inline-end" className="p-0">
                <SearchIcon className="size-5 text-zinc-300" />
              </InputGroupAddon>
            </InputGroup>
          </Field>

          <div className="flex flex-col gap-2">
            <FilterSection title={t('Type')}>
              <div className="flex flex-col gap-3">
                {typeOptions.map((option) => (
                  <div key={option.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                      <div className="w-6 h-6 flex items-center justify-center" aria-hidden="true">
                        {option.Icon && <option.Icon className="w-6 h-6" />}
                      </div>
                      <span>{option.label}</span>
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
            </FilterSection>

            <FilterSection title={t('Medium')}>
              <div className="flex flex-col gap-3">
                {contentOptions.map((option) => (
                  <div key={option.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                      <div className="w-6 h-6 flex items-center justify-center" aria-hidden="true">
                        {option.Icon && <option.Icon className="w-6 h-6" />}
                      </div>
                      <span>{option.label}</span>
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
            </FilterSection>

            <FilterSection title={t('Duration')}>
              <div className="flex flex-col gap-4">
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
            </FilterSection>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default PatientLibraryDesktopFilters;
