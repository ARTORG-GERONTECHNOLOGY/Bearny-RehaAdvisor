// src/components/Health/HealthViewControls.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { ViewMode } from '@/types/health';
import type { HealthPageStore } from '@/stores/healthPageStore';
import { Button } from '@/components/ui/button';
import { ShareIcon } from 'lucide-react';
import ArrowLeftIcon from '@/assets/icons/arrow-left-fill.svg?react';
import ArrowRightIcon from '@/assets/icons/arrow-right-fill.svg?react';
import { Badge } from '@/components/ui/badge';

type Props = {
  store: HealthPageStore;
  t: (k: string) => string;
  formatRangeLabel: (start: Date, end: Date) => string;
  onExportClick: () => void;
};

const VIEW_MODES: ViewMode[] = ['weekly', 'monthly'];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const HealthViewControls: React.FC<Props> = observer(
  ({ store, t, formatRangeLabel, onExportClick }) => {
    return (
      <div className="flex flex-wrap items-center justify-between">
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 select-none">
            <ArrowLeftIcon
              className="mt-0.5 h-4 w-4 hover:cursor-pointer"
              aria-label={t('Previous')}
              onClick={store.goPrev}
              data-testid="view-controls-prev"
            />
            <div className="text-sm capitalize">
              {store.viewMode}, {formatRangeLabel(store.viewStart, store.viewEnd)}
            </div>
            <ArrowRightIcon
              className="mt-0.5 h-4 w-4 hover:cursor-pointer"
              aria-label={t('Next')}
              onClick={store.goNext}
              data-testid="view-controls-next"
            />
          </div>

          <div className="flex gap-2" role="group" aria-label={t('View Mode')}>
            {VIEW_MODES.map((mode) => (
              <Badge
                key={mode}
                onClick={() => store.setViewMode(mode)}
                variant={store.viewMode === mode ? 'filter-active' : 'filter-inactive'}
                role="button"
                aria-pressed={store.viewMode === mode}
                className="rounded-lg border border-accent"
                data-testid={`view-mode-${mode}`}
              >
                {t(VIEW_MODE_LABELS[mode])}
              </Badge>
            ))}
          </div>
        </div>

        <Button size="dashboard" onClick={onExportClick} data-testid="view-controls-export">
          <ShareIcon />
          {t('Export')}
        </Button>
      </div>
    );
  }
);

export default HealthViewControls;
