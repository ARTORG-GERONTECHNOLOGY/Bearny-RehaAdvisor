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
  const [limit, setLimit] = useState<string>(''); // keep as string for input UX

  // reset defaults if config changes while modal is open (rare but safe)
  useEffect(() => {
    if (!show) return;
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
    setLimit('');
    setFile(null);
    interventionsImportStore.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const canSubmit = useMemo(
    () => !!file && !interventionsImportStore.loading,
    [file, interventionsImportStore.loading]
  );

  const close = () => {
    if (interventionsImportStore.loading) return;
    interventionsImportStore.reset();
    setFile(null);
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
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
              {' '}
              <span className="text-muted">
                {t('ID format')}{': '}
                <code>3500_web_de</code> {t('(original)')} /&nbsp;
                <code>30500_vid_pt</code> {t('(self-made)')}
                {' — '}
                {t('formats')}{': '}
                <code>vid, img, pdf, web, aud, app, br, gfx</code>
                {' — '}
                {t('languages')}{': '}
                <code>de, fr, it, pt, nl, en</code>
              </span>
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
                  <option value="en">EN</option>
                  <option value="de">DE</option>
                  <option value="fr">FR</option>
                  <option value="it">IT</option>
                  <option value="pt">PT</option>
                  <option value="nl">NL</option>
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
                {(() => {
                  const errorsCount = r.errors_count ?? (r.errors || []).filter((e: any) => e.severity !== 'warning').length;
                  const warningsCount = r.warnings ?? (r.errors || []).filter((e: any) => e.severity === 'warning').length;
                  return (
                    <>
                      {errorsCount > 0 && (
                        <Badge bg="danger">{t('Errors')}: {errorsCount}</Badge>
                      )}
                      {warningsCount > 0 && (
                        <Badge bg="warning" text="dark">{t('Warnings')}: {warningsCount}</Badge>
                      )}
                      {errorsCount === 0 && warningsCount === 0 && (
                        <Badge bg="success">{t('Errors')}: 0</Badge>
                      )}
                    </>
                  );
                })()}
              </div>

              {(r.errors?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="fw-semibold mb-2">{t('Details')}</div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }} className="border rounded p-2">
                    {(r.errors || []).slice(0, 200).map((e: any, idx: number) => {
                      const isWarning = e.severity === 'warning';
                      return (
                        <div key={idx} className="small mb-2">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <Badge bg={isWarning ? 'warning' : 'danger'} text={isWarning ? 'dark' : undefined}>
                              {isWarning ? t('Warning') : t('Error')}
                            </Badge>
                            <span>
                              <strong>{t('Row')}:</strong> {e.row ?? '-'}{' '}
                              <strong className="ms-2">{t('ID')}:</strong>{' '}
                              <code>{e.intervention_id ?? e.external_id ?? '-'}</code>
                            </span>
                          </div>
                          <div className={`mt-1 ${isWarning ? 'text-warning-emphasis' : 'text-danger'}`}>
                            {e.error ?? '-'}
                          </div>
                          <hr className="my-2" />
                        </div>
                      );
                    })}
                    {(r.errors || []).length > 200 && (
                      <div className="text-muted small">
                        {t('Too many issues to display (showing first 200).')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Form>
      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">
        <Button
          variant="outline-secondary"
          onClick={close}
          disabled={interventionsImportStore.loading}
        >
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
