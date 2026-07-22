import React from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { PatientPopupStore } from '@/stores/patientPopupStore';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';

interface PatientInfoWearablesSyncResultProps {
  store: PatientPopupStore;
}

const PatientInfoWearablesSyncResult: React.FC<PatientInfoWearablesSyncResultProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();

    if (!store.wearablesSyncResult) return null;

    return (
      <Alert
        variant="success"
        onClose={() => {
          store.wearablesSyncResult = null;
          store.wearablesSyncPayloads = null;
        }}
        closeLabel={t('Close')}
      >
        <strong>{t('Wearables synced to REDCap')}</strong>
        <ul>
          {Object.entries(store.wearablesSyncResult).map(([period, status]) => (
            <li key={period}>
              {t(period)}: <code>{status}</code>
              {store.wearablesSyncPayloads?.[period]?.reason && (
                <span className="ms-2 text-muted">
                  ({store.wearablesSyncPayloads[period].reason})
                </span>
              )}
            </li>
          ))}
        </ul>
        {store.wearablesSyncPayloads && (
          <>
            <div className="mb-1">{t('Payload sent to REDCap (by period)')}</div>
            {Object.entries(store.wearablesSyncPayloads).map(([period, payload]) => {
              const details = (payload as any) || {};
              const record = details.record || {};
              return (
                <div key={period} className="mb-1 p-2 bg-back border rounded">
                  <div className="fw-semibold mb-1">{t(period)}</div>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell>{t('status')}</TableCell>
                        <TableCell>
                          <code>{String(details.status ?? 'unknown')}</code>
                        </TableCell>
                      </TableRow>
                      {details.reason && (
                        <TableRow>
                          <TableCell>{t('reason')}</TableCell>
                          <TableCell>{String(details.reason)}</TableCell>
                        </TableRow>
                      )}
                      {details.error && (
                        <TableRow>
                          <TableCell>{t('Error')}</TableCell>
                          <TableCell>{String(details.error)}</TableCell>
                        </TableRow>
                      )}
                      {Object.entries(record).map(([field, value]) => (
                        <TableRow key={`${period}-${field}`}>
                          <TableCell>{field}</TableCell>
                          <TableCell>{String(value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </>
        )}
      </Alert>
    );
  }
);

export default PatientInfoWearablesSyncResult;
