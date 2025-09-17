import React, { useMemo, useState } from 'react';
import { Card, Badge, Modal } from 'react-bootstrap';
import { TemplateItem } from '../../types/templates';

type Props = {
  items: TemplateItem[];
  horizonDays?: number; // default 84
};

const normalizeSegment = (segOrSchedule: any) => {
  const raw = segOrSchedule?.schedule ? segOrSchedule.schedule : segOrSchedule || {};
  const start_day = segOrSchedule?.from_day ?? raw.start_day ?? 1;
  const end_day   = raw.end_day ?? segOrSchedule?.end_day;
  const selectedDays = raw.selectedDays || raw.selected_days || [];
  return {
    unit: raw.unit || 'day',
    interval: raw.interval ?? 1,
    selectedDays,
    start_day,
    end_day,
    start_time: raw.start_time || raw.startTime || '08:00',
  };
};

const getSegments = (it: TemplateItem) => {
  const segs = (it as any).segments;
  if (Array.isArray(segs) && segs.length) return segs.map((s: any) => normalizeSegment(s));
  const s = normalizeSegment(it.schedule);
  return [s];
};

const pickSegmentForDay = (it: TemplateItem, day: number) => {
  const segs = getSegments(it);
  return (
    segs.find(seg => day >= (seg.start_day ?? 1) && (!seg.end_day || day <= seg.end_day)) ||
    segs[0]
  );
};

const countOccurrencesInRange = (it: TemplateItem, fromDay: number, toDay?: number) => {
  const occ = it.occurrences || [];
  return occ.filter(o => o.day >= fromDay && (toDay ? o.day <= toDay : true)).length;
};

const segmentSummary = (seg: any, it: TemplateItem) => {
  const daysStr =
    Array.isArray(seg.selectedDays) && seg.selectedDays.length
      ? ` • ${seg.selectedDays.join(', ')}`
      : '';
  const rangeStr = ` from day ${seg.start_day}${seg.end_day ? ` → day ${seg.end_day}` : ''}`;
  const occCount = countOccurrencesInRange(it, seg.start_day, seg.end_day);
  return `• ${seg.unit}/${seg.interval}${daysStr}${rangeStr} • Occurrences: ${occCount}`;
};

const TemplateTimeline: React.FC<Props> = ({ items, horizonDays = 84 }) => {
  // map: day -> list of { item, title, time }
  const byDay = useMemo(() => {
    const map: Record<number, Array<{ item: TemplateItem; title: string; time?: string }>> = {};
    items.forEach((it) => {
      (it.occurrences || []).forEach((o) => {
        if (o.day < 1 || o.day > horizonDays) return;
        if (!map[o.day]) map[o.day] = [];
        map[o.day].push({ item: it, title: it.intervention.title, time: o.time });
      });
    });
    return map;
  }, [items, horizonDays]);

  const days = Array.from({ length: horizonDays }, (_, i) => i + 1);

  // day modal
  const [openDay, setOpenDay] = useState<number | null>(null);
  const dayEvents = openDay ? byDay[openDay] || [] : [];

  return (
    <>
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
            <Card.Header className="py-1 px-2">
              <strong>Day {d}</strong>
            </Card.Header>
            <Card.Body className="py-2 px-2">
              <div className="template-list">
                {(byDay[d] || []).map((ev, i) => (
                  <div key={i} className="small mb-1">
                    <Badge bg="secondary" className="me-1">{ev.time || '—'}</Badge>
                    {ev.title}
                  </div>
                ))}
                {(!byDay[d] || byDay[d].length === 0) && (
                  <div className="text-muted small">—</div>
                )}
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>

      <Modal show={openDay != null} onHide={() => setOpenDay(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Day {openDay}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {dayEvents.length === 0 ? (
            <div className="text-muted">No items on this day.</div>
          ) : (
            dayEvents.map((ev, idx) => {
              const seg = pickSegmentForDay(ev.item, openDay!);
              return (
                <div key={idx} className="mb-3">
                  <div className="fw-semibold">
                    {ev.time || '—'} {ev.title}
                  </div>
                  <div className="small text-muted">
                    For: {ev.item.diagnosis} {segmentSummary(seg, ev.item)}
                  </div>
                </div>
              );
            })
          )}
        </Modal.Body>
      </Modal>
    </>
  );
};

export default TemplateTimeline;
