import React from 'react';
import { SearchIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import BarsFilterIcon from '@/assets/icons/bars-filter-fill.svg?react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

type InterventionCardItem = {
  _id?: string | number;
  id?: string | number;
  title?: string;
  duration?: string | number;
  content_type?: string;
  aims?: string[];
  intervention_title?: string;
  intervention_id?: string;
};

type PatientLibrarySearchPanelProps = {
  searchTerm: string;
  isSearchOpen: boolean;
  searchResults: InterventionCardItem[];
  onSearchTermChange: (value: string) => void;
  onCloseSearch: () => void;
  onOpenFilter: () => void;
  onOpenDetails: (item: InterventionCardItem) => void;
  renderHighlightedTitle: (title: string) => React.ReactNode;
  getDisplayTitle: (item: InterventionCardItem) => string;
  getResultIcon: (item: InterventionCardItem) => React.ComponentType<{ className?: string }>;
};

const PatientLibrarySearchPanel: React.FC<PatientLibrarySearchPanelProps> = ({
  searchTerm,
  isSearchOpen,
  searchResults,
  onSearchTermChange,
  onCloseSearch,
  onOpenFilter,
  onOpenDetails,
  renderHighlightedTitle,
  getDisplayTitle,
  getResultIcon,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        aria-label={t('Close search')}
        onClick={onCloseSearch}
        className={`fixed inset-0 z-10 bg-black/80 transition-opacity duration-300 ${
          isSearchOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div className="relative mx-4 mt-14 h-14">
        <div
          className={`absolute z-20 transition-all duration-300 ease-in-out ${
            isSearchOpen
              ? 'rounded-[40px] border-none bg-white -left-6 -right-6 -top-6 p-4'
              : 'bg-transparent p-0 left-0 right-0 top-0'
          }`}
        >
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Field>
                <InputGroup className="rounded-full border border-accent bg-white h-14 !px-5 !py-4">
                  <InputGroupInput
                    id="inline-end-input"
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
            </div>

            {isSearchOpen ? (
              <Button
                size="icon"
                variant="secondary"
                onClick={onCloseSearch}
                className="bg-zinc-100"
                aria-label={t('Close search')}
              >
                <X className="text-zinc-500" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="secondary"
                onClick={onOpenFilter}
                className="bg-white"
                aria-label={t('Open filter')}
              >
                <BarsFilterIcon />
              </Button>
            )}
          </div>

          <div
            className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
              isSearchOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="mt-6">
              {searchResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="font-medium text-sm text-zinc-500">
                    {searchResults.length} {t('Contents')}
                  </div>
                  {searchResults.map((item) => {
                    const title = getDisplayTitle(item);
                    const contentType = String(item?.content_type || '-').trim();
                    const durationText = isNaN(Number(item?.duration))
                      ? '-'
                      : `${item.duration}min`;
                    const ResultIcon = getResultIcon(item);
                    return (
                      <button
                        key={item._id || item.id}
                        type="button"
                        onClick={() => onOpenDetails(item)}
                        className="w-full text-left rounded-3xl p-4 bg-zinc-50 hover:bg-zinc-100 transition-colors border border-accent"
                      >
                        <div className="flex gap-3">
                          <ResultIcon className="w-8 h-8 shrink-0" />
                          <div className="flex-1 flex flex-col gap-1 min-w-0">
                            <div className="font-bold text-lg line-clamp-2 text-zinc-400">
                              {renderHighlightedTitle(title)}
                            </div>
                            <div className="flex items-center gap-2 font-medium text-sm text-zinc-500 truncate">
                              <span>{durationText}</span>
                              <span>•</span>
                              <span className="capitalize">{contentType}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">{t('No entries found.')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PatientLibrarySearchPanel;
