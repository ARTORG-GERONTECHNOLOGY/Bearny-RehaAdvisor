// components/TherapistInterventionPage/TemplateTimeline.tsx
import React, { useMemo, useState } from 'react';
import { TemplateItem } from '@/types/templates';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import {
  countOccurrencesInRange,
  formatSegmentSummary,
  getSegments,
  hasWeekdaySegment,
  pickSegmentForDay,
} from '@/utils/templateSchedule';

type TitleMap = Record<string, { title: string; lang: string | null }>;

type Props = {
  items: TemplateItem[];
  horizonDays?: number; // default 84
  translatedTitles?: TitleMap; // 👈 NEW
};

const TemplateTimeline: React.FC<Props> = ({ items, horizonDays = 84, translatedTitles }) => {
  const { t } = useTranslation();

  // day -> list of events (keep original title; we’ll translate at render)
  const byDay = useMemo(() => {
    const map: Record<
      number,
      Array<{ item: TemplateItem; rawTitle: string; id: string; time?: string }>
    > = {};
    items.forEach((it) => {
      (it.occurrences || []).forEach((o) => {
        if (o.day < 1 || o.day > horizonDays) return;
        if (!map[o.day]) map[o.day] = [];
        map[o.day].push({
          item: it,
          rawTitle: it.intervention.title,
          id: it.intervention._id,
          time: o.time,
        });
      });
    });
    return map;
  }, [items, horizonDays]);

  const days = Array.from({ length: horizonDays }, (_, i) => i + 1);

  // day modal
  const [openDay, setOpenDay] = useState<number | null>(null);
  const dayEvents = openDay ? byDay[openDay] || [] : [];

  const showWeekdayHint = useMemo(
    () => items.some((it) => hasWeekdaySegment(getSegments(it))),
    [items]
  );

  const displayTitle = (id: string, fallback: string) => translatedTitles?.[id]?.title || fallback;
  const srcLang = (id: string) => translatedTitles?.[id]?.lang;

  return (
    <>
      {showWeekdayHint && (
        <Alert className="mb-3">
          {t(
            'Day 1 is shown as a Monday. For a patient, Day 1 is their start date, but weekday sessions stay on the same weekdays.'
          )}
        </Alert>
      )}
      <div className="template-grid">
        <style>{`
          .template-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: .75rem;
          }
          .template-day {
            height: 140px;
            overflow: hidden;
            cursor: pointer;
          }
          .template-list {
            max-height: 90px;
            overflow-y: auto;
          }
        `}</style>

        {days.map((d) => (
          <Card key={d} className="template-day" onClick={() => setOpenDay(d)} role="button">
            <CardHeader className="p-2 bg-back">
              <CardTitle>
                {t('Day')} {d}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="template-list">
                {(byDay[d] || []).map((ev, i) => (
                  <div key={i} className="text-sm mb-1">
                    <Badge variant="dashboard" className="px-1 py-0 me-1">
                      {ev.time || '—'}
                    </Badge>
                    {displayTitle(ev.id, ev.rawTitle)}
                    {srcLang(ev.id) && (
                      <span className="text-muted-foreground ms-1">
                        ({t('Translated from')}: {srcLang(ev.id)})
                      </span>
                    )}
                  </div>
                ))}
                {(!byDay[d] || byDay[d].length === 0) && (
                  <div className="text-muted-foreground text-sm">—</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={openDay != null} onOpenChange={(open) => !open && setOpenDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('Day')} {openDay}
            </DialogTitle>
          </DialogHeader>
          {dayEvents.length === 0 ? (
            <div className="text-muted-foreground">{t('No items on this day.')}</div>
          ) : (
            dayEvents.map((ev, idx) => {
              const seg = pickSegmentForDay(ev.item, openDay!);
              const title = displayTitle(ev.id, ev.rawTitle);
              return (
                <div key={idx} className="mb-3">
                  <div className="font-semibold">
                    {ev.time || '—'} {title}
                    {srcLang(ev.id) && (
                      <span className="text-muted-foreground ms-2 text-sm">
                        ({t('Translated from')}: {srcLang(ev.id)})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('For:')} {ev.item.diagnosis} •{' '}
                    {formatSegmentSummary(
                      seg,
                      countOccurrencesInRange(ev.item, seg.start_day, seg.end_day),
                      t
                    )}
                  </div>
                </div>
              );
            })
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateTimeline;
