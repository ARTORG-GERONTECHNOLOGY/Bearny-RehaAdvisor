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

type Props = {
  showStudyGroup?: boolean;
};

export function PatientListSkeleton({ showStudyGroup = false }: Props) {
  const { t } = useTranslation();

  return (
    <div aria-live="polite" role="status">
      <span className="sr-only">{t('Loading patients...')}</span>
      <Table aria-label={t('Active patients')} aria-hidden="true">
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Birth Date')}</TableHead>
            <TableHead>{t('Sex')}</TableHead>
            <TableHead>{t('Diagnosis_patient_list')}</TableHead>
            {showStudyGroup && <TableHead>{t('Group')}</TableHead>}
            <TableHead>{t('Login')}</TableHead>
            <TableHead>{t('Adherence')}</TableHead>
            <TableHead>{t('Feedback')}</TableHead>
            <TableHead>{t('Wear')}</TableHead>
            <TableHead>{t('Flag')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-10" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28" />
              </TableCell>
              {showStudyGroup && (
                <TableCell>
                  <Skeleton className="h-6 w-14 rounded-full" />
                </TableCell>
              )}
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default PatientListSkeleton;
