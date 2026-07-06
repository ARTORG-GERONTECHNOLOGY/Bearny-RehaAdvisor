import React from 'react';
import { Badge, Spinner, Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { FaSyncAlt } from 'react-icons/fa';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PatientPopupStore } from '@/stores/patientPopupStore';

interface PatientInfoRedcapCardProps {
  store: PatientPopupStore;
}

const PatientInfoRedcapCard: React.FC<PatientInfoRedcapCardProps> = observer(({ store }) => {
  const { t } = useTranslation();
  const hasRedcap = (store.redcapRows?.length || 0) > 0;

  return (
    <div className="mb-2 break-inside-avoid-column">
      <Card>
        <CardHeader>
          <CardTitle>{t('REDCap')}</CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            {t('This data is fetched live from REDCap and is not stored in the platform database.')}
          </CardDescription>
          <CardAction>
            <Button
              variant="secondary"
              size="dashboard"
              onClick={() => store.fetchRedcapIfPossible(t)}
              disabled={store.redcapLoading}
            >
              <FaSyncAlt />
              {store.redcapLoading ? t('Loading...') : t('Refresh')}
            </Button>
          </CardAction>
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
              <Spinner animation="border" role="status" aria-label={t('Loading')} />
              <p className="mt-3">{t('Loading')}...</p>
            </div>
          ) : !hasRedcap ? (
            <p className="text-zinc-500 text-xs mb-0">
              {t('No REDCap data available for this patient.')}
            </p>
          ) : (
            <Table hover responsive size="sm">
              <tbody>
                {Object.entries(store.redcapFlat || {}).map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <span className="text-xs text-zinc-500">{k}</span>
                    </td>
                    <td className="text-sm whitespace-pre-wrap font-medium">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default PatientInfoRedcapCard;
