import React from 'react';
import { Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';

interface PatientInfoRedcapCardProps {
  store: PatientPopupStore;
}

const PatientInfoRedcapCard: React.FC<PatientInfoRedcapCardProps> = observer(({ store }) => {
  const { t } = useTranslation();
  const hasRedcap = (store.redcapRows?.length || 0) > 0;

  return (
    <div className="mb-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('REDCap')}</CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            {t('This data is fetched live from REDCap and is not stored in the platform database.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-zinc-500 text-xs mb-3">
            {store.redcapProject ? (
              <div className="flex items-center flex-wrap gap-2">
                <div>
                  {t('Project')}: <Badge bg="info">{store.redcapProject}</Badge>
                </div>
                <div>
                  {t('Records')}: {store.redcapRows?.length || 0}
                </div>
              </div>
            ) : (
              <span>{t('No project selected')}</span>
            )}
          </div>

          {store.redcapLoading ? (
            <div className="text-center my-4">
              <Spinner aria-label={t('Loading')} />
              <p className="mt-3">{t('Loading')}...</p>
            </div>
          ) : !hasRedcap ? (
            <p className="text-zinc-500 text-xs mb-0">
              {t('No REDCap data available for this patient.')}
            </p>
          ) : (
            <Table>
              <TableBody>
                {Object.entries(store.redcapFlat || {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>
                      <span className="text-xs text-zinc-500">{k}</span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-pre-wrap font-medium">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default PatientInfoRedcapCard;
