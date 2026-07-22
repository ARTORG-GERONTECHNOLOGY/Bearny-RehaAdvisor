// src/components/TherapistPatientPage/PatientFilters.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

import { TherapistPatientsStore, SortKey } from '@/stores/therapistPatientsStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { FaUndo } from 'react-icons/fa';
import { SearchIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

type Props = {
  store: TherapistPatientsStore;
  sexOptions: string[];
  durationOptions: string[];
};

// Sentinel for the "clear filter" Select item — Radix forbids an empty-string item value.
const CLEAR_FILTER_VALUE = '__clear__';

const PatientFilters: React.FC<Props> = observer(({ store, sexOptions, durationOptions }) => {
  const { t } = useTranslation();

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <InputGroup>
              <InputGroupInput
                type="text"
                placeholder={String(t('Search by name, ID or username'))}
                value={store.searchTerm}
                onChange={(e) => store.setSearchTerm(e.target.value)}
              />
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
            </InputGroup>
          </div>

          <Input
            type="date"
            value={store.birthdateFilter}
            onChange={(e) => store.setBirthdateFilter(e.target.value)}
            aria-label={String(t('Filter by Birth Date'))}
          />

          <Select
            value={store.sexFilter || CLEAR_FILTER_VALUE}
            onValueChange={(value) => store.setSexFilter(value === CLEAR_FILTER_VALUE ? '' : value)}
          >
            <SelectTrigger aria-label={String(t('Filter by Sex'))}>
              <SelectValue placeholder={String(t('Filter by Sex'))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLEAR_FILTER_VALUE}>{String(t('Filter by Sex'))}</SelectItem>
              {sexOptions.map((sex) => (
                <SelectItem key={sex} value={sex}>
                  {String(t(sex))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={store.durationFilter || CLEAR_FILTER_VALUE}
            onValueChange={(value) =>
              store.setDurationFilter(value === CLEAR_FILTER_VALUE ? '' : value)
            }
          >
            <SelectTrigger aria-label={String(t('Filter by Duration'))}>
              <SelectValue placeholder={String(t('Filter by Duration'))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLEAR_FILTER_VALUE}>{String(t('Filter by Duration'))}</SelectItem>
              {durationOptions.map((duration) => (
                <SelectItem key={duration} value={duration}>
                  {String(t(duration))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={store.diseaseFilter || CLEAR_FILTER_VALUE}
            onValueChange={(value) =>
              store.setDiseaseFilter(value === CLEAR_FILTER_VALUE ? '' : value)
            }
          >
            <SelectTrigger aria-label={String(t('Filter by Disease'))}>
              <SelectValue placeholder={String(t('Filter by Disease'))} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLEAR_FILTER_VALUE}>{String(t('Filter by Disease'))}</SelectItem>
              {store.diseaseOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {String(t(d))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div>
            <Label htmlFor="sort-by-select" className="me-2">
              {String(t('Sort by'))}
            </Label>
            <Select
              value={store.sortBy}
              onValueChange={(value) => store.setSortBy(value as SortKey)}
            >
              <SelectTrigger id="sort-by-select" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ampel">{String(t('Performance'))}</SelectItem>
                <SelectItem value="created">{String(t('Newest created'))}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 items-center md:pt-6">
            <Switch
              id="toggle-completed"
              checked={store.showCompleted}
              onCheckedChange={(checked) => store.setShowCompleted(checked)}
            />
            <Label htmlFor="toggle-completed" className="cursor-pointer">
              {String(t('Show completed'))}
            </Label>
          </div>

          <Button
            size="dashboard"
            variant="secondary"
            onClick={store.resetFilters}
            className="self-end"
          >
            <FaUndo />
            {String(t('Reset filters'))}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export default PatientFilters;
