import { useTranslation } from 'react-i18next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function InterventionListSkeleton() {
  const { t } = useTranslation();

  return (
    <div aria-live="polite" role="status">
      <span className="sr-only">{t('Loading interventions...')}</span>
      <Table aria-label={t('Intervention List')} aria-hidden="true">
        <TableHeader>
          <TableRow>
            <TableHead>{t('Type')}</TableHead>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Medium')}</TableHead>
            <TableHead className="capitalize">{t('languages')}</TableHead>
            <TableHead>{t('Rating')}</TableHead>
            <TableHead>{t('Tags')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default InterventionListSkeleton;
