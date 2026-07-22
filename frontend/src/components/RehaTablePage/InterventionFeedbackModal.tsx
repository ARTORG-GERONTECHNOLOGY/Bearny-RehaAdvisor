import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import StarRating, { getRatingFromDateEntry } from './StarRating';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getInterventionDateStatusClass } from '@/utils/interventions';

type AnyObj = Record<string, any>;

interface Props {
  show: boolean;
  onHide: () => void;
  intervention: AnyObj; // should include dates[] with feedback/video
  initialDatetime?: string;
}

const safeT = (t: any, key: string) => {
  const v = t(key);
  return typeof v === 'string' ? v : key;
};

const asArray = (v: any) => (Array.isArray(v) ? v : []);

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// very defensive language pick
const pickTranslation = (translations: any[], preferredLang: string) => {
  const arr = asArray(translations);
  return (
    arr.find((tr: any) => tr?.language === preferredLang)?.text ||
    arr.find((tr: any) => tr?.language === 'en')?.text ||
    arr[0]?.text ||
    ''
  );
};

const InterventionFeedbackModal: React.FC<Props> = ({
  show,
  onHide,
  intervention,
  initialDatetime,
}) => {
  const { t, i18n } = useTranslation();
  const userLang = i18n.language || 'en';

  const allDates = useMemo(() => asArray(intervention?.dates), [intervention]);

  const [onlyWithFeedback, setOnlyWithFeedback] = useState(true);

  // reset UI when opening a different intervention/modal
  useEffect(() => {
    if (show) {
      if (initialDatetime) {
        // Show all dates so the target is always reachable, then select it
        setOnlyWithFeedback(false);
        const idx = allDates.findIndex((d: any) => d?.datetime === initialDatetime);
        setSelectedIdx(idx >= 0 ? idx : 0);
      } else {
        setOnlyWithFeedback(true);
        setSelectedIdx(0);
      }
    }
  }, [show, intervention?._id, initialDatetime]);

  // counts
  const totalScheduled = allDates.length;

  const answeredCount = useMemo(() => {
    return allDates.reduce((acc: number, d: any) => {
      const fbCount = asArray(d?.feedback).length;
      const hasVideo = !!d?.video?.video_url;
      // treat either Q-feedback or video feedback as "answered"
      return acc + (fbCount > 0 || hasVideo ? 1 : 0);
    }, 0);
  }, [allDates]);

  const visibleDates = useMemo(() => {
    if (!onlyWithFeedback) return allDates;
    return allDates.filter((d: any) => {
      const fbCount = asArray(d?.feedback).length;
      const hasVideo = !!d?.video?.video_url;
      return fbCount > 0 || hasVideo;
    });
  }, [allDates, onlyWithFeedback]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = visibleDates[selectedIdx] || null;

  // if filter makes current index invalid, clamp
  useEffect(() => {
    if (selectedIdx >= visibleDates.length) setSelectedIdx(0);
  }, [visibleDates.length, selectedIdx]);

  const feedback = asArray(selected?.feedback);

  const title = intervention?.title || safeT(t, 'Intervention');

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {safeT(t, 'Feedback')}: {title}
          </DialogTitle>
        </DialogHeader>

        {!totalScheduled ? (
          <Alert variant="info" className="mb-0">
            {safeT(t, 'No scheduled events found')}
          </Alert>
        ) : (
          <>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="text-muted">
                {t('answeredFeedbackSummary', { answered: answeredCount, total: totalScheduled })}.
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="onlyWithFeedbackSwitch"
                  checked={onlyWithFeedback}
                  onCheckedChange={(checked) => setOnlyWithFeedback(checked)}
                />
                <Label htmlFor="onlyWithFeedbackSwitch" className="cursor-pointer">
                  {safeT(t, 'Show only dates with feedback')}
                </Label>
              </div>
            </div>

            {!visibleDates.length ? (
              <Alert className="mb-0">{safeT(t, 'No feedback available')}</Alert>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* LEFT: dates list (scrollable) */}
                <div className="md:col-span-5">
                  <div className="fw-semibold mb-2">{safeT(t, 'Dates')}</div>

                  <div className="flex flex-col gap-1">
                    {visibleDates.map((d: any, idx: number) => {
                      const st = String(d?.status || '').toLowerCase();
                      const fbCount = asArray(d?.feedback).length;
                      const hasVid = !!d?.video?.video_url;
                      const isActive = idx === selectedIdx;

                      return (
                        <button
                          key={d?.datetime || idx}
                          type="button"
                          onClick={() => setSelectedIdx(idx)}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                            isActive
                              ? 'border-chartMuted bg-chartMuted'
                              : 'border-border bg-background hover:bg-accent'
                          )}
                        >
                          <span style={{ fontSize: 13 }}>
                            {formatDateTime(String(d?.datetime || ''))}
                          </span>

                          <span className="d-flex gap-1 align-items-center">
                            {st ? (
                              <Badge
                                variant="dashboard"
                                className={getInterventionDateStatusClass(st)}
                              >
                                {safeT(t, st)}
                              </Badge>
                            ) : null}

                            {fbCount > 0 ? <Badge variant="dashboard">Q:{fbCount}</Badge> : null}
                            {hasVid ? <Badge variant="dashboard-warning">V</Badge> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT: feedback detail (scrollable if long) */}
                <div className="md:col-span-7">
                  {!selected ? (
                    <Alert variant="info">{safeT(t, 'Select a date')}</Alert>
                  ) : (
                    <div>
                      {/* video */}
                      {selected?.video?.video_url ? (
                        <div className="mb-3">
                          <div className="fw-semibold mb-2">{safeT(t, 'Video feedback')}</div>
                          <video
                            src={selected.video.video_url}
                            controls
                            style={{ width: '100%', borderRadius: 8 }}
                          />
                          {selected.video.comment ? (
                            <div className="text-muted mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                              {selected.video.comment}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="fw-semibold mb-2">{safeT(t, 'Answers')}</div>

                      {!feedback.length ? (
                        <Alert>{safeT(t, 'No feedback available')}</Alert>
                      ) : (
                        <div className="divide-y rounded-md border">
                          {feedback.map((fb: any, i: number) => {
                            const q = fb?.question;
                            const qText = pickTranslation(q?.translations, userLang);

                            const answers = asArray(fb?.answer);
                            const answerText = answers
                              .map((a: any) => pickTranslation(a?.translations, userLang) || a?.key)
                              .filter(Boolean)
                              .join(', ');

                            return (
                              <div key={i} className="px-3 py-2">
                                <div className="fw-semibold">{qText || safeT(t, 'Question')}</div>

                                {(() => {
                                  const r = getRatingFromDateEntry({ feedback: [fb] });
                                  return r !== null ? (
                                    <div className="mt-1">
                                      <StarRating value={r} showNumber />
                                    </div>
                                  ) : answerText ? (
                                    <div className="mt-1">{answerText}</div>
                                  ) : null;
                                })()}

                                {fb?.comment ? (
                                  <div
                                    className="text-muted mt-2"
                                    style={{ whiteSpace: 'pre-wrap' }}
                                  >
                                    {fb.comment}
                                  </div>
                                ) : null}

                                {fb?.audio_url ? (
                                  <div className="mt-2">
                                    <audio controls src={fb.audio_url} />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onHide}>
            {safeT(t, 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InterventionFeedbackModal;
