import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { Form, Alert } from 'react-bootstrap';
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
            variant="danger"
            dismissible
            onClose={() => (store.error = '')}
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {store.error}
          </Alert>
        )}

        {Object.keys(store.fieldErrors).length > 0 && (
          <Alert variant="danger">
            <ul className="mb-0">
              {Object.entries(store.fieldErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Form>
          {store.isModify ? (
            <Form.Group className="mb-3">
              <Form.Label>{t('Effective from')}</Form.Label>
              <DatePicker
                selected={store.effectiveFrom}
                onChange={(d) => (store.effectiveFrom = d as Date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
              />
            </Form.Group>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label>{t('Start Date')}</Form.Label>
              <DatePicker
                selected={store.startDateCreate}
                onChange={(d) => (store.startDateCreate = d as Date)}
                className="form-control"
                dateFormat="yyyy-MM-dd"
              />
            </Form.Group>
          )}

          {store.isModify && (
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label={t('Keep current schedule (only update flags)')}
                checked={store.keepCurrent}
                onChange={(e) => (store.keepCurrent = e.target.checked)}
              />
            </Form.Group>
          )}

          {(!store.isModify || !store.keepCurrent) && (
            <Form.Group className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center mb-3">
              <Form.Label className="sm:col-span-4">{t('Start Time')}</Form.Label>
              <div className="sm:col-span-8">
                <Form.Control
                  type="time"
                  value={store.startTime}
                  onChange={(e) => (store.startTime = e.target.value)}
                />
              </div>
            </Form.Group>
          )}

          {(!store.isModify || !store.keepCurrent) && (
            <>
              <Form.Group className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center mb-3">
                <Form.Label className="sm:col-span-4">{t('Repeat every')}</Form.Label>
                <div className="sm:col-span-4">
                  <Form.Control
                    type="number"
                    min="1"
                    value={store.interval}
                    onChange={(e) => (store.interval = Number(e.target.value))}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Form.Select
                    value={store.unit}
                    onChange={(e) => (store.unit = e.target.value as any)}
                  >
                    <option value="day">{t('Day')}</option>
                    <option value="week">{t('Week')}</option>
                    <option value="month">{t('Month')}</option>
                  </Form.Select>
                </div>
                <div className="sm:col-span-12">
                  <Form.Text muted>{store.summary}</Form.Text>
                </div>
              </Form.Group>

              {store.unit === 'week' && (
                <Form.Group className="mb-3">
                  <div className="d-flex flex-wrap gap-2">
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
                </Form.Group>
              )}

              <Form.Group className="mb-3">
                <Form.Label>{t('Ends')}</Form.Label>
                <div className="d-flex flex-column gap-2">
                  <Form.Check
                    type="radio"
                    label={t('Never')}
                    checked={store.endOption === 'never'}
                    onChange={() => (store.endOption = 'never')}
                  />
                  <Form.Check
                    type="radio"
                    label={t('On date')}
                    checked={store.endOption === 'date'}
                    onChange={() => (store.endOption = 'date')}
                  />
                  {store.endOption === 'date' && (
                    <DatePicker
                      selected={store.endDate}
                      onChange={(d) => (store.endDate = d as Date)}
                      className="form-control"
                      dateFormat="yyyy-MM-dd"
                    />
                  )}
                  <Form.Check
                    type="radio"
                    label={t('After N times')}
                    checked={store.endOption === 'count'}
                    onChange={() => (store.endOption = 'count')}
                  />
                  {store.endOption === 'count' && (
                    <Form.Control
                      type="number"
                      value={store.occurrenceCount}
                      onChange={(e) => (store.occurrenceCount = Number(e.target.value))}
                    />
                  )}
                </div>
              </Form.Group>
            </>
          )}

          <Form.Group className="mb-3">
            <Form.Label>{t('Personal instructions for the patient')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={store.personalNote}
              onChange={(e) => (store.personalNote = e.target.value)}
              placeholder={t(
                'e.g., Keep shoulders relaxed; perform slowly and stop if pain > 4/10.'
              )}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label={t('Ask video feedback from patient')}
              checked={store.requireVideoFeedback}
              onChange={() => (store.requireVideoFeedback = !store.requireVideoFeedback)}
            />
          </Form.Group>
        </Form>

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
