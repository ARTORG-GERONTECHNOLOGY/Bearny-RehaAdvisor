import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatLocaleDateTime } from '@/utils/dateFormat';

type Scope = 'all' | 'single';

interface RemoveIntervention {
  _id: string;
  title?: string;
  dates?: Array<{ datetime: string }>;
}

interface Props {
  show: boolean;
  onHide: () => void;
  intervention: RemoveIntervention;
  onConfirm: (occurrenceDatetime?: string) => void | Promise<void>;
}

const InterventionRemoveModal: React.FC<Props> = ({ show, onHide, intervention, onConfirm }) => {
  const { t } = useTranslation();

  const futureDates = useMemo(() => {
    const now = new Date();
    return (intervention.dates || [])
      .filter((d) => new Date(d.datetime) > now)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  }, [intervention.dates]);

  const [scope, setScope] = useState<Scope>('all');
  const [occurrenceDatetime, setOccurrenceDatetime] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!show) return;
    setScope('all');
    setOccurrenceDatetime(futureDates[0]?.datetime || '');
    setSubmitting(false);
  }, [show, intervention._id]);

  const canConfirm = scope === 'all' || (scope === 'single' && !!occurrenceDatetime);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(scope === 'single' ? occurrenceDatetime : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Remove intervention')}</DialogTitle>
        </DialogHeader>

        <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="remove-scope-all" />
            <Label htmlFor="remove-scope-all" className="cursor-pointer">
              {t('Remove all upcoming occurrences')}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="single"
              id="remove-scope-single"
              disabled={futureDates.length === 0}
            />
            <Label htmlFor="remove-scope-single" className="cursor-pointer">
              {t('Remove a single occurrence')}
            </Label>
          </div>

          {scope === 'single' && (
            <Field className="pl-6">
              <FieldLabel htmlFor="remove-occurrence">{t('Occurrence')}</FieldLabel>
              <Select value={occurrenceDatetime} onValueChange={setOccurrenceDatetime}>
                <SelectTrigger id="remove-occurrence">
                  <SelectValue placeholder={t('Select a date')} />
                </SelectTrigger>
                <SelectContent>
                  {futureDates.map((d) => (
                    <SelectItem key={d.datetime} value={d.datetime}>
                      {formatLocaleDateTime(d.datetime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </RadioGroup>

        <DialogFooter>
          <Button
            type="button"
            size="dashboard"
            variant="secondary"
            onClick={onHide}
            disabled={submitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            size="dashboard"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="bg-nok hover:bg-nok/90"
          >
            {submitting ? t('Removing...') : t('Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InterventionRemoveModal;
