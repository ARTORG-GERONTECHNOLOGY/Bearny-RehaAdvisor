import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateEU, toEuroDate } from '@/utils/healthCharts';

export type MetricDetailColumn<Row> = {
  key: keyof Row;
  header: string;
  format: (value: number) => string;
  color?: (value: number | null) => string | undefined;
};

type Props<Row extends { date: string }> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dateHeader: string;
  emptyMessage: string;
  start?: Date | null;
  end?: Date | null;
  // Optional goal/threshold badges shown between the header and the chart.
  legend?: React.ReactNode;
  chart: React.ReactNode;
  rows: Row[];
  columns: MetricDetailColumn<Row>[];
};

// Generic "card click -> chart + table" detail view shared by all health metric cards.
// A column's `key` must point at a numeric (or null) field on `Row`; non-numeric fields
// (e.g. free-text notes) aren't supported since the table cell always renders via `format`.
const MetricDetailDialog = <Row extends { date: string }>({
  open,
  onOpenChange,
  title,
  dateHeader,
  emptyMessage,
  start,
  end,
  legend,
  chart,
  rows,
  columns,
}: Props<Row>) => {
  const rowsWithData = useMemo(
    () => rows.filter((r) => columns.some((c) => r[c.key] != null)),
    [rows, columns]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {start && end && (
            <DialogDescription>
              {formatDateEU(start)} — {formatDateEU(end)}
            </DialogDescription>
          )}
        </DialogHeader>

        {legend && <div className="flex flex-wrap gap-2">{legend}</div>}

        {chart}

        {rowsWithData.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dateHeader}</TableHead>
                {columns.map((c) => (
                  <TableHead key={String(c.key)}>{c.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsWithData.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{toEuroDate(r.date)}</TableCell>
                  {columns.map((c) => {
                    const value = (r[c.key] as unknown as number | null) ?? null;
                    return (
                      <TableCell key={String(c.key)}>
                        <span
                          className="font-mono font-medium tabular-nums"
                          style={{ color: c.color?.(value) }}
                        >
                          {value != null ? c.format(value) : '--'}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-zinc-500">{emptyMessage}</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MetricDetailDialog;
