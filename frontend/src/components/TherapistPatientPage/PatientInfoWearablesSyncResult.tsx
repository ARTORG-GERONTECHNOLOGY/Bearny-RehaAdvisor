import React from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { PatientPopupStore } from '@/stores/patientPopupStore';

interface PatientInfoWearablesSyncResultProps {
  store: PatientPopupStore;
}

const PatientInfoWearablesSyncResult: React.FC<PatientInfoWearablesSyncResultProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();

    if (!store.wearablesSyncResult) return null;

    return (
      <div className="alert alert-success alert-dismissible" role="alert">
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
                  <Table size="sm" className="mb-0">
                    <tbody>
                      <tr>
                        <td>{t('status')}</td>
                        <td>
                          <code>{String(details.status ?? 'unknown')}</code>
                        </td>
                      </tr>
                      {details.reason && (
                        <tr>
                          <td>{t('reason')}</td>
                          <td>{String(details.reason)}</td>
                        </tr>
                      )}
                      {details.error && (
                        <tr>
                          <td>{t('Error')}</td>
                          <td>{String(details.error)}</td>
                        </tr>
                      )}
                      {Object.entries(record).map(([field, value]) => (
                        <tr key={`${period}-${field}`}>
                          <td>{field}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              );
            })}
          </>
        )}
        <button
          type="button"
          className="btn-close"
          onClick={() => {
            store.wearablesSyncResult = null;
            store.wearablesSyncPayloads = null;
          }}
          aria-label={t('Close')}
        />
      </div>
    );
  }
);

export default PatientInfoWearablesSyncResult;
