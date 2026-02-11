// src/components/TherapistInterventionPage/ImportInterventionsModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import interventionsConfig from '../../config/interventions.json';
import { interventionsImportStore } from '../../stores/interventionsImportStore';

type Props = {
  show: boolean;
  onHide: () => void;
  /** Called after a successful import (e.g., refresh library store) */
  onSuccess?: () => void;
};

const ImportInterventionsModal: React.FC<Props> = observer(({ show, onHide, onSuccess }) => {
  const { t } = useTranslation();

  const [file, setFile] = useState<File | null>(null);

  // ✅ defaults driven by interventions.json (falls back safely)
  const defaultSheet = (interventionsConfig as any)?.importDefaults?.sheetName || 'Content';
  const defaultLangFromCfg = (interventionsConfig as any)?.importDefaults?.defaultLang || 'en';
  const defaultKeepLegacy = (interventionsConfig as any)?.importDefaults?.keepLegacyFields ?? false;
  const defaultDryRun = (interventionsConfig as any)?.importDefaults?.dryRun ?? false;

  const [sheetName, setSheetName] = useState(defaultSheet);
  const [defaultLang, setDefaultLang] = useState(defaultLangFromCfg);
  const [keepLegacy, setKeepLegacy] = useState(Boolean(defaultKeepLegacy));
  const [dryRun, setDryRun] = useState(Boolean(defaultDryRun));
  const [limit, setLimit] = useState<string>(''); // keep as string for input UX

  // reset defaults if config changes while modal is open (rare but safe)
  useEffect(() => {
    if (!show) return;
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
    setKeepLegacy(Boolean(defaultKeepLegacy));
    setDryRun(Boolean(defaultDryRun));
    setLimit('');
    setFile(null);
    interventionsImportStore.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const canSubmit = useMemo(() => !!file && !interventionsImportStore.loading, [file, interventionsImportStore.loading]);

  const close = () => {
    if (interventionsImportStore.loading) return;
    interventionsImportStore.reset();
    setFile(null);
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
    setKeepLegacy(Boolean(defaultKeepLegacy));
    setDryRun(Boolean(defaultDryRun));
    setLimit('');
    onHide();
  };

  const submit = async () => {
    if (!file) return;

    const parsedLimit = limit.trim() ? Number(limit) : null;
    const limitOrNull =
      parsedLimit !== null && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

    await interventionsImportStore.importFromExcel(file, {
      // ✅ backend import service still expects these field names
      sheet_name: sheetName || defaultSheet || 'Content',
      default_lang: (defaultLang || defaultLangFromCfg || 'en').toLowerCase(),
      keep_legacy_fields: Boolean(keepLegacy), // optional, but your backend supports it
      dry_run: Boolean(dryRun),
      limit: limitOrNull,
    });

    if (!interventionsImportStore.error && interventionsImportStore.result) {
      onSuccess?.();
    }
  };

  const r = interventionsImportStore.result;

  return (
    <Modal show={show} onHide={close} centered size="lg" backdrop="static" keyboard>
      <Modal.Header closeButton>
        <Modal.Title>{t('Import interventions')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {interventionsImportStore.error && (
          <Alert variant="danger" role="alert">
            {interventionsImportStore.error}
          </Alert>
        )}

        <Form>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">{t('Excel file (.xlsx / .xlsm)')}</Form.Label>
            <Form.Control
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={interventionsImportStore.loading}
            />
            <div className="text-muted small mt-1">
              {t('The file should contain the intervention sheet (default: Content).')}
            </div>
          </Form.Group>

          <div className="border rounded p-3 mb-3">
            <div className="fw-semibold mb-2">{t('Options')}</div>

            <div className="d-flex flex-wrap gap-3">
              <Form.Group style={{ minWidth: 220 }}>
                <Form.Label className="fw-semibold">{t('Sheet name')}</Form.Label>
                <Form.Control
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  disabled={interventionsImportStore.loading}
                  placeholder={defaultSheet}
                />
              </Form.Group>

              <Form.Group style={{ minWidth: 160 }}>
                <Form.Label className="fw-semibold">{t('Default language')}</Form.Label>
                <Form.Select
                  value={defaultLang}
                  onChange={(e) => setDefaultLang(e.target.value)}
                  disabled={interventionsImportStore.loading}
                >
                  {/* ✅ Align with your supported language set */}
                  <option value="en">EN</option>
                  <option value="de">DE</option>
                  <option value="fr">FR</option>
                  <option value="it">IT</option>
                </Form.Select>
              </Form.Group>

              <Form.Group style={{ minWidth: 140 }}>
                <Form.Label className="fw-semibold">{t('Limit')}</Form.Label>
                <Form.Control
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  disabled={interventionsImportStore.loading}
                  placeholder={t('Optional')}
                  inputMode="numeric"
                />
                <div className="text-muted small">{t('Import only first N rows')}</div>
              </Form.Group>
            </div>

            <div className="mt-3 d-flex flex-wrap gap-4">
              <Form.Check
                type="checkbox"
                id="keepLegacy"
                label={t('Keep legacy fields (link/media_file)')}
                checked={keepLegacy}
                onChange={(e) => setKeepLegacy(e.target.checked)}
                disabled={interventionsImportStore.loading}
              />

              <Form.Check
                type="checkbox"
                id="dryRun"
                label={t('Dry run (no DB write)')}
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={interventionsImportStore.loading}
              />
            </div>

            {/* ✅ new model hint */}
            <div className="text-muted small mt-3">
              {t('Import will populate the new media[] model. Legacy fields are optional.')}
            </div>
          </div>

          {r && (
            <div className="border rounded p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="fw-semibold">{t('Import result')}</div>
                {r.message && <div className="text-muted small">{r.message}</div>}
              </div>

              <div className="mt-2 d-flex flex-wrap gap-2">
                <Badge bg="success">
                  {t('Created')}: {r.created ?? 0}
                </Badge>
                <Badge bg="primary">
                  {t('Updated')}: {r.updated ?? 0}
                </Badge>
                <Badge bg="secondary">
                  {t('Skipped')}: {r.skipped ?? 0}
                </Badge>
                <Badge bg={(r.errors?.length ?? 0) ? 'danger' : 'success'}>
                  {t('Errors')}: {r.errors?.length ?? 0}
                </Badge>
              </div>

              {(r.errors?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="fw-semibold mb-2">{t('Error details')}</div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }} className="border rounded p-2">
                    {(r.errors || []).slice(0, 200).map((e: any, idx: number) => (
                      <div key={idx} className="small mb-2">
                        <div>
                          <strong>{t('Row')}:</strong> {e.row ?? '-'}{' '}
                          <strong className="ms-2">{t('ID')}:</strong> {e.intervention_id ?? e.external_id ?? '-'}
                        </div>
                        <div className="text-danger">{e.error ?? '-'}</div>
                        <hr className="my-2" />
                      </div>
                    ))}
                    {(r.errors || []).length > 200 && (
                      <div className="text-muted small">{t('Too many errors to display (showing first 200).')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Form>
      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">
        <Button variant="outline-secondary" onClick={close} disabled={interventionsImportStore.loading}>
          {t('Close')}
        </Button>

        <Button variant="primary" onClick={submit} disabled={!canSubmit}>
          {interventionsImportStore.loading ? (
            <span className="d-inline-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" /> {t('Importing...')}
            </span>
          ) : (
            t('Import')
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
});

export default ImportInterventionsModal;
