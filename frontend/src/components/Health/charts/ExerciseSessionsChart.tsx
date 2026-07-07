import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import ExerciseSessionsTable from '@/components/Health/charts/ExerciseSessionsTable';
import type { FitbitEntry } from '@/types/health';
import { eachDateInRange, isInRange } from '@/utils/healthCharts';

type Props = {
  data: FitbitEntry[];
  start?: Date | null;
  end?: Date | null;
};

type Session = { name: string; duration: number };
type ExerciseRow = { date: string; total: number | null; sessions: Session[] };

const SESSION_COLORS = ['#00956C', '#32ad82', '#4cc196'];
const sessionColor = (index: number) => SESSION_COLORS[index % SESSION_COLORS.length];

const sessionDurationMinutes = (session: { duration?: number }): number =>
  session?.duration ? session.duration / 60000 : 0;

export const filterExerciseInRange = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): ExerciseRow[] => {
  const raw = Array.isArray(data) ? data : [];
  const byDate = new Map(
    raw
      .filter((d) => isInRange(d.date, start, end))
      .map((d) => {
        const sessions: Session[] = (d.exercise?.sessions || [])
          .map((s: any) => ({ name: s?.name || '', duration: sessionDurationMinutes(s) }))
          .filter((s) => s.duration > 0);
        return [d.date, sessions];
      })
  );

  const dates = start && end ? eachDateInRange(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => {
    const sessions = byDate.get(date);
    return {
      date,
      total: sessions ? sessions.reduce((sum, s) => sum + s.duration, 0) : null,
      sessions: sessions ?? [],
    };
  });
};

export const averageExerciseMinutes = (
  data: FitbitEntry[],
  start?: Date | null,
  end?: Date | null
): number | null => {
  const values = filterExerciseInRange(data, start, end)
    .map((r) => r.total)
    .filter((v): v is number => v != null);

  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const formatHM = (min: number) => {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

type SessionTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string; value?: number; payload?: Record<string, unknown> }[];
};

const SessionTooltip: React.FC<SessionTooltipProps> = ({ active, label, payload }) => {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p) => (p.value ?? 0) > 0);
  if (!entries.length) return null;

  return (
    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{label}</div>
      <div className="grid gap-1">
        {entries.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: sessionColor(Number(entry.dataKey?.slice(1))) }}
            />
            <span className="flex-1 text-muted-foreground">
              {String(entry.payload?.[`${entry.dataKey}Name`] ?? '')}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatHM(entry.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExerciseSessionsChart = forwardRef<SVGSVGElement, Props>(({ data, start, end }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const rows = useMemo(() => filterExerciseInRange(data, start, end), [data, start, end]);
  const hasSessions = useMemo(() => rows.some((r) => r.sessions.length > 0), [rows]);
  const maxSessions = useMemo(
    () => rows.reduce((max, r) => Math.max(max, r.sessions.length), 0),
    [rows]
  );

  const chartRows = useMemo(
    () =>
      rows.map((row) => {
        const wide: Record<string, number | string> = { date: row.date };
        row.sessions.forEach((s, i) => {
          wide[`s${i}`] = s.duration;
          wide[`s${i}Name`] = s.name || t('Exercise');
        });
        return wide;
      }),
    [rows, t]
  );

  const chartConfig: ChartConfig = useMemo(() => ({}) as ChartConfig, []);

  // Recharts doesn't expose its inner <svg> via a ref prop, so grab it off the
  // container once rendered. Used for PDF export, which needs a real SVGSVGElement.
  useEffect(() => {
    if (!ref || typeof ref === 'function') return;
    (ref as React.RefObject<SVGSVGElement | null>).current =
      containerRef.current?.querySelector('svg') ?? null;
  });

  const selectedDateObj = useMemo(
    () => (selectedDate ? new Date(selectedDate) : null),
    [selectedDate]
  );

  if (!hasSessions) {
    return (
      <div className="flex h-24 w-full items-center justify-center text-sm text-zinc-500">
        {t('No exercise sessions in this period.')}
      </div>
    );
  }

  return (
    <>
      <ChartContainer ref={containerRef} config={chartConfig} className="w-full max-h-24">
        <BarChart accessibilityLayer data={chartRows}>
          <CartesianGrid vertical={false} />
          <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.1]} />
          <XAxis hide dataKey="date" />
          <ChartTooltip content={<SessionTooltip />} />
          {Array.from({ length: maxSessions }, (_, i) => (
            <Bar
              key={`s${i}`}
              dataKey={`s${i}`}
              stackId="sessions"
              fill={sessionColor(i)}
              cursor="pointer"
              onClick={(barData: any) => {
                const day = barData?.date ?? barData?.payload?.date;
                if (day) setSelectedDate(day);
              }}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent side="right" className="overflow-y-auto min-w-[40vw]">
          <SheetHeader>
            <SheetTitle>{t('Exercises')}</SheetTitle>
            <SheetDescription>
              {t('Date')}: {selectedDate}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {selectedDateObj && (
              <ExerciseSessionsTable data={data} start={selectedDateObj} end={selectedDateObj} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
});

ExerciseSessionsChart.displayName = 'ExerciseSessionsChart';

export default ExerciseSessionsChart;
