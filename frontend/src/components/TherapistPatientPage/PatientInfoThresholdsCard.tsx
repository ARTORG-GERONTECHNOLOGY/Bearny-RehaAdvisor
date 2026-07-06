import React from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PatientPopupStore, PatientThresholds } from '@/stores/patientPopupStore';
import ThresholdHistory from '@/components/TherapistPatientPage/ThresholdHistory';
import { Badge } from '@/components/ui/badge';

export interface ThresholdFieldGroup {
  id: string;
  /** 'min.' or 'max.' shown above the view-mode label. */
  viewPrefix: string;
  viewLabel: string;
  unit: string;
  /** Determines the edit-mode hint text ("Green should be >= yellow" vs "Green max should be <= yellow max"). */
  kind: 'min' | 'max';
  min: number;
  max: number;
  green: keyof PatientThresholds;
  greenLabel: string;
  yellow?: keyof PatientThresholds;
  yellowLabel?: string;
}

export const THRESHOLD_FIELD_GROUPS: ThresholdFieldGroup[] = [
  {
    id: 'steps',
    viewPrefix: 'min.',
    viewLabel: 'Steps goal',
    unit: '',
    kind: 'min',
    min: 0,
    max: 200000,
    green: 'steps_goal',
    greenLabel: 'Steps goal',
  },
  {
    id: 'active_minutes',
    viewPrefix: 'min.',
    viewLabel: 'Active Minutes',
    unit: 'min',
    kind: 'min',
    min: 0,
    max: 1440,
    green: 'active_minutes_green',
    greenLabel: 'Active zone minutes (green)',
    yellow: 'active_minutes_yellow',
    yellowLabel: 'Active zone minutes (yellow)',
  },
  {
    id: 'sleep',
    viewPrefix: 'min.',
    viewLabel: 'Sleep',
    unit: 'min',
    kind: 'min',
    min: 0,
    max: 1440,
    green: 'sleep_green_min',
    greenLabel: 'Sleep min (green, minutes)',
    yellow: 'sleep_yellow_min',
    yellowLabel: 'Sleep min (yellow, minutes)',
  },
  {
    id: 'bp_sys',
    viewPrefix: 'max.',
    viewLabel: 'BP systolic',
    unit: 'mmHg',
    kind: 'max',
    min: 50,
    max: 250,
    green: 'bp_sys_green_max',
    greenLabel: 'BP systolic green max',
    yellow: 'bp_sys_yellow_max',
    yellowLabel: 'BP systolic yellow max',
  },
  {
    id: 'bp_dia',
    viewPrefix: 'max.',
    viewLabel: 'BP diastolic',
    unit: 'mmHg',
    kind: 'max',
    min: 30,
    max: 180,
    green: 'bp_dia_green_max',
    greenLabel: 'BP diastolic green max',
    yellow: 'bp_dia_yellow_max',
    yellowLabel: 'BP diastolic yellow max',
  },
];

interface PatientInfoThresholdsCardProps {
  store: PatientPopupStore;
}

const PatientInfoThresholdsCard: React.FC<PatientInfoThresholdsCardProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();

    return (
      <div className="mb-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t('Goals & thresholds')}</CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              {t(
                'These goals affect how health charts are colored and how progress is interpreted.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div>
              {!store.thresholds ? (
                <div className="text-zinc-500 text-xs">{t('No thresholds loaded.')}</div>
              ) : !store.isEditing ? (
                <div className="grid grid-cols-2 items-center justify-items-start gap-2">
                  {THRESHOLD_FIELD_GROUPS.map((g) => {
                    const greenVal =
                      store.thresholdDraft[g.green] ?? store.thresholds?.[g.green] ?? '-';
                    const yellowVal = g.yellow
                      ? (store.thresholdDraft[g.yellow] ?? store.thresholds?.[g.yellow] ?? '-')
                      : undefined;
                    return (
                      <React.Fragment key={g.id}>
                        <div>
                          <div className="text-zinc-500 text-xs">{g.viewPrefix}</div>
                          <div className="text-sm font-medium">{t(g.viewLabel)}</div>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="dashboard" className="bg-ok/5 border-ok text-ok">
                            {greenVal} {g.unit}
                          </Badge>
                          {g.yellow && (
                            <Badge
                              variant="dashboard"
                              className="bg-yellow/5 border-yellow text-yellow"
                            >
                              {yellowVal} {g.unit}
                            </Badge>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <Row className="g-3">
                  {THRESHOLD_FIELD_GROUPS.map((g) => (
                    <React.Fragment key={g.id}>
                      <Col xs={12} md={g.yellow ? 6 : 12}>
                        <Form.Group controlId={g.green}>
                          <Form.Label className="fw-semibold">{t(g.greenLabel)}</Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft[g.green] ?? store.thresholds?.[g.green] ?? 0
                            }
                            onChange={(e) =>
                              store.setThresholdField(g.green, Number(e.target.value))
                            }
                            min={g.min}
                            max={g.max}
                          />
                        </Form.Group>
                      </Col>
                      {g.yellow && (
                        <Col xs={12} md={6}>
                          <Form.Group controlId={g.yellow}>
                            <Form.Label className="fw-semibold">{t(g.yellowLabel!)}</Form.Label>
                            <Form.Control
                              type="number"
                              value={
                                store.thresholdDraft[g.yellow] ?? store.thresholds?.[g.yellow] ?? 0
                              }
                              onChange={(e) =>
                                store.setThresholdField(g.yellow!, Number(e.target.value))
                              }
                              min={g.min}
                              max={g.max}
                            />
                            <div className="text-muted small mt-1">
                              {g.kind === 'min'
                                ? t('Green should be ≥ yellow')
                                : t('Green max should be ≤ yellow max')}
                            </div>
                          </Form.Group>
                        </Col>
                      )}
                    </React.Fragment>
                  ))}
                </Row>
              )}

              {store.isEditing && (
                <Row className="g-3 mt-2">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="thresholdEffectiveFrom">
                      <Form.Label className="fw-semibold">
                        {t('Effective from (optional)')}
                      </Form.Label>
                      <Form.Control
                        type="datetime-local"
                        value={store.thresholdEffectiveFromLocal}
                        onChange={(e) => store.setThresholdEffectiveFromLocal(e.target.value)}
                      />
                      <div className="text-muted small mt-1">
                        {t('Leave empty to apply immediately.')}
                      </div>
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="thresholdReason">
                      <Form.Label className="fw-semibold">{t('Reason (optional)')}</Form.Label>
                      <Form.Control
                        type="text"
                        value={store.thresholdReason}
                        onChange={(e) => store.setThresholdReason(e.target.value)}
                        maxLength={500}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              )}
            </div>

            {(store.thresholdsHistory?.length ?? 0) > 0 && (
              <>
                <Separator className="my-2" />

                <div className="text-zinc-500 text-xs">
                  {t('Older thresholds are saved automatically when you update goals.')}
                </div>

                <ThresholdHistory history={store.thresholdsHistory} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
);

export default PatientInfoThresholdsCard;
