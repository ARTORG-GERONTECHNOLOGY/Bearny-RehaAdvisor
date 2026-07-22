import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert } from '@/components/ui/alert';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import authStore from '@/stores/authStore';
import config from '@/config/config.json';
import { InterventionRepeatModalStore } from '@/stores/interventionRepeatModalStore';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Input, datePickerInputClassName } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type Mode = 'create' | 'modify';

interface Props {
  show: boolean;
  onHide: () => void;

  // ✅ called after successful submit (RehabTable triggers fetchAll/fetchInts/etc)
  onSuccess?: () => void | Promise<void>;

  // For store.submit() payload
  patient: string;
  intervention: string | { _id: string };
  mode?: Mode;
  therapistId?: string;
  defaults?: any;
}

const InterventionRepeatModal: React.FC<Props> = observer((props) => {
  const { t } = useTranslation();
  const store = useMemo(() => new InterventionRepeatModalStore(), []);

  const {
    show,
    onHide,
    onSuccess,
    patient,
    intervention,
    mode = 'create',
    therapistId,
    defaults,
  } = props;

  // diagnosis routing (same logic as before)
  const specs = (authStore.specialisations || []).map((s) => String(s).trim()).filter(Boolean);
  const diagnoses = Array.isArray(specs)
    ? specs.flatMap((spec) => (config as any)?.patientInfo?.function?.[spec]?.diagnosis || [])
    : [];
  const isDiagnosis = diagnoses.includes(patient) || patient === 'all';

  useEffect(() => {
    store.reset(show, mode, defaults);
  }, [show, mode, defaults]);

  // ✅ Close immediately after success + trigger refresh callback
  useEffect(() => {
    if (!show) return;
    if (!store.success) return;

    (async () => {
      try {
        await onSuccess?.();
      } finally {
        // close modal regardless of refresh outcome
        onHide();

        // prevent the effect from firing again if the component stays mounted
        store.success = false;
      }
    })();
  }, [store.success, show]);

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{store.isModify ? t('Modify schedule') : t('Frequency')}</DialogTitle>
        </DialogHeader>

        {store.error && (
          <Alert
            variant="destructive"
            onClose={() => (store.error = '')}
            closeLabel={t('Close alert')}
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {store.error}
          </Alert>
        )}

        {Object.keys(store.fieldErrors).length > 0 && (
          <Alert variant="destructive">
            <ul className="list-disc pl-6 mb-0">
              {Object.entries(store.fieldErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <form>
          <FieldGroup>
            {store.isModify ? (
              <Field>
                <FieldLabel htmlFor="ir-effective-from">{t('Effective from')}</FieldLabel>
                <DatePicker
                  id="ir-effective-from"
                  selected={store.effectiveFrom}
                  onChange={(d) => (store.effectiveFrom = d as Date)}
                  className={datePickerInputClassName}
                  portalId="datepicker-portal"
                  popperClassName="!z-[60] !pointer-events-auto"
                  dateFormat="yyyy-MM-dd"
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="ir-start-date">{t('Start Date')}</FieldLabel>
                <DatePicker
                  id="ir-start-date"
                  selected={store.startDateCreate}
                  onChange={(d) => (store.startDateCreate = d as Date)}
                  className={datePickerInputClassName}
                  portalId="datepicker-portal"
                  popperClassName="!z-[60] !pointer-events-auto"
                  dateFormat="yyyy-MM-dd"
                />
              </Field>
            )}

            {store.isModify && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ir-keep-current"
                  checked={store.keepCurrent}
                  onCheckedChange={(checked) => (store.keepCurrent = !!checked)}
                />
                <Label htmlFor="ir-keep-current" className="cursor-pointer">
                  {t('Keep current schedule (only update flags)')}
                </Label>
              </div>
            )}

            {(!store.isModify || !store.keepCurrent) && (
              <Field className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <FieldLabel htmlFor="ir-start-time" className="sm:col-span-4">
                  {t('Start Time')}
                </FieldLabel>
                <div className="sm:col-span-8">
                  <Input
                    id="ir-start-time"
                    type="time"
                    value={store.startTime}
                    onChange={(e) => (store.startTime = e.target.value)}
                  />
                </div>
              </Field>
            )}

            {(!store.isModify || !store.keepCurrent) && (
              <>
                <Field className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <FieldLabel htmlFor="ir-repeat-every" className="sm:col-span-4">
                    {t('Repeat every')}
                  </FieldLabel>
                  <div className="sm:col-span-4">
                    <Input
                      id="ir-repeat-every"
                      type="number"
                      min="1"
                      value={store.interval}
                      onChange={(e) => (store.interval = Number(e.target.value))}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Select value={store.unit} onValueChange={(v) => (store.unit = v as any)}>
                      <SelectTrigger id="ir-repeat-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">{t('Day')}</SelectItem>
                        <SelectItem value="week">{t('Week')}</SelectItem>
                        <SelectItem value="month">{t('Month')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-12">
                    <FieldDescription>{store.summary}</FieldDescription>
                  </div>
                </Field>

                {store.unit === 'week' && (
                  <div className="flex flex-wrap gap-2">
                    {store.weekdays.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        size="dashboard"
                        variant={store.selectedDays.includes(day) ? undefined : 'secondary'}
                        onClick={() => store.toggleDay(day)}
                      >
                        {t(day)}
                      </Button>
                    ))}
                  </div>
                )}

                <Field>
                  <FieldLabel>{t('Ends')}</FieldLabel>
                  <RadioGroup
                    value={store.endOption}
                    onValueChange={(v) => (store.endOption = v as any)}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="never" id="ir-end-never" />
                      <Label htmlFor="ir-end-never" className="cursor-pointer">
                        {t('Never')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="date" id="ir-end-date" />
                      <Label htmlFor="ir-end-date" className="cursor-pointer">
                        {t('On date')}
                      </Label>
                    </div>
                    {store.endOption === 'date' && (
                      <DatePicker
                        selected={store.endDate}
                        onChange={(d) => (store.endDate = d as Date)}
                        className={datePickerInputClassName}
                        portalId="datepicker-portal"
                        popperClassName="!z-[60] !pointer-events-auto"
                        dateFormat="yyyy-MM-dd"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="count" id="ir-end-count" />
                      <Label htmlFor="ir-end-count" className="cursor-pointer">
                        {t('After N times')}
                      </Label>
                    </div>
                    {store.endOption === 'count' && (
                      <Input
                        type="number"
                        value={store.occurrenceCount}
                        onChange={(e) => (store.occurrenceCount = Number(e.target.value))}
                      />
                    )}
                  </RadioGroup>
                </Field>
              </>
            )}

            <Field>
              <FieldLabel htmlFor="ir-personal-note">
                {t('Personal instructions for the patient')}
              </FieldLabel>
              <Textarea
                id="ir-personal-note"
                rows={3}
                value={store.personalNote}
                onChange={(e) => (store.personalNote = e.target.value)}
                placeholder={t(
                  'e.g., Keep shoulders relaxed; perform slowly and stop if pain > 4/10.'
                )}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Checkbox
                id="ir-video-feedback"
                checked={store.requireVideoFeedback}
                onCheckedChange={() => (store.requireVideoFeedback = !store.requireVideoFeedback)}
              />
              <Label htmlFor="ir-video-feedback" className="cursor-pointer">
                {t('Ask video feedback from patient')}
              </Label>
            </div>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            type="button"
            size="dashboard"
            variant="secondary"
            onClick={onHide}
            disabled={store.submitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            size="dashboard"
            onClick={() =>
              store.submit({
                patient,
                intervention,
                therapistId,
                isDiagnosis,
              })
            }
            disabled={!store.canSubmit || store.submitting}
          >
            {store.submitting ? t('Saving...') : store.isModify ? t('Save changes') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default InterventionRepeatModal;
