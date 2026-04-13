// src/components/TherapistInterventionPage/ImportInterventionsModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Badge, Button, Form, Modal, Nav, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import interventionsConfig from '../../config/interventions.json';
import { interventionsImportStore } from '../../stores/interventionsImportStore';
import {
  interventionsMediaUploadStore,
  MediaUploadFileResult,
} from '../../stores/interventionsMediaUploadStore';

type Props = {
  show: boolean;
  onHide: () => void;
  /** Called after a successful import (e.g., refresh library store) */
  onSuccess?: () => void;
};

// Client-side filename validation — mirrors backend _FILENAME_RE exactly.
// Matches: {4-5 digits}_{format}_{lang}.{ext}
// e.g. 3500_web_de.mp4  → external_id = 3500_web
//      3500_aud_de.mp3  → external_id = 3500_aud
//      3500_pdf_de.pdf  → external_id = 3500_pdf
const FILE_NAME_RE =
  /^(\d{4,5}_(?:vid|img|pdf|web|aud|app|br|gfx)_[a-z]{2})\.(mp4|mp3|wav|pdf|jpg|jpeg|png)$/i;

const ACCEPTED_EXTENSIONS = '.mp4,.mp3,.wav,.pdf,.jpg,.jpeg,.png';
const ACCEPTED_MIME = 'video/mp4,audio/mpeg,audio/wav,application/pdf,image/jpeg,image/png';

const MAX_FILE_SIZE_MB = 1024; // 1 GB
const MAX_EXCEL_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function getMaxSizeMB(_filename: string): number {
  return MAX_FILE_SIZE_MB;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type ValidatedFile = {
  file: File;
  valid: boolean;
  externalId: string | null;
  tooLarge: boolean;
  maxSizeMB: number;
};

function validateMediaFile(file: File): ValidatedFile {
  const maxSizeMB = getMaxSizeMB(file.name);
  const tooLarge = file.size > maxSizeMB * 1024 * 1024;
  const m = FILE_NAME_RE.exec(file.name);
  if (!m) return { file, valid: false, externalId: null, tooLarge, maxSizeMB };
  // Derive external_id: strip trailing _XX language suffix
  const stem = m[1];
  const parts = stem.split('_');
  const externalId = parts.length >= 2 ? parts.slice(0, -1).join('_') : stem;
  return { file, valid: true, externalId: externalId.toLowerCase(), tooLarge, maxSizeMB };
}

const ImportInterventionsModal: React.FC<Props> = observer(({ show, onHide, onSuccess }) => {
  const { t } = useTranslation();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'excel' | 'media'>('excel');

  // ── Excel tab state ────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [excelSizeError, setExcelSizeError] = useState<string | null>(null);

  const defaultSheet = (interventionsConfig as any)?.importDefaults?.sheetName || 'Content';
  const defaultLangFromCfg = (interventionsConfig as any)?.importDefaults?.defaultLang || 'en';

  const [sheetName, setSheetName] = useState(defaultSheet);
  const [defaultLang, setDefaultLang] = useState(defaultLangFromCfg);
  const [limit, setLimit] = useState<string>('');

  // ── Video tab state ────────────────────────────────────────────────────────
  const [mediaFiles, setVideoFiles] = useState<File[]>([]);

  // ── Reset on open/close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!show) return;
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
    setLimit('');
    setFile(null);
    setExcelSizeError(null);
    setVideoFiles([]);
    setActiveTab('excel');
    interventionsImportStore.reset();
    interventionsMediaUploadStore.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // ── Excel helpers ──────────────────────────────────────────────────────────
  const canSubmit = useMemo(
    () => !!file && !excelSizeError && !interventionsImportStore.loading,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file, excelSizeError, interventionsImportStore.loading]
  );

  const close = () => {
    if (interventionsImportStore.loading || interventionsMediaUploadStore.loading) return;
    interventionsImportStore.reset();
    interventionsMediaUploadStore.reset();
    setFile(null);
    setExcelSizeError(null);
    setVideoFiles([]);
    setSheetName(defaultSheet);
    setDefaultLang(defaultLangFromCfg);
    setLimit('');
    setActiveTab('excel');
    onHide();
  };

  const submitExcel = async () => {
    if (!file) return;
    const parsedLimit = limit.trim() ? Number(limit) : null;
    const limitOrNull =
      parsedLimit !== null && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

    await interventionsImportStore.importFromExcel(file, {
      sheet_name: sheetName || defaultSheet || 'Content',
      default_lang: (defaultLang || defaultLangFromCfg || 'en').toLowerCase(),
      limit: limitOrNull,
    });

    if (!interventionsImportStore.error && interventionsImportStore.result) {
      onSuccess?.();
    }
  };

  // ── Video tab helpers ──────────────────────────────────────────────────────
  const validatedMediaFiles: ValidatedFile[] = mediaFiles.map(validateMediaFile);
  const hasValidMediaFiles = validatedMediaFiles.some((vf) => vf.valid && !vf.tooLarge);

  const handleMediaFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setVideoFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...picked.filter((f) => !existingNames.has(f.name))];
    });
    // Reset input value so the same file can be re-selected after removal
    e.target.value = '';
  };

  const ACCEPTED_EXTS_SET = new Set(['mp4', 'mp3', 'wav', 'pdf', 'jpg', 'jpeg', 'png']);

  const handleMediaDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return ACCEPTED_EXTS_SET.has(ext);
    });
    setVideoFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...dropped.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeMediaFile = (idx: number) => {
    setVideoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitMedia = async () => {
    const filesToUpload = validatedMediaFiles
      .filter((vf) => vf.valid && !vf.tooLarge)
      .map((vf) => vf.file);
    if (filesToUpload.length === 0) return;
    await interventionsMediaUploadStore.uploadMedia(filesToUpload);
  };

  const r = interventionsImportStore.result;
  const vr = interventionsMediaUploadStore.results;

  return (
    <Modal show={show} onHide={close} centered size="lg" backdrop="static" keyboard>
      <Modal.Header closeButton>
        <Modal.Title>{t('Import interventions')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* ── Tab switcher ── */}
        <Nav
          variant="tabs"
          activeKey={activeTab}
          onSelect={(k) => {
            if (k === 'excel' || k === 'media') setActiveTab(k);
          }}
          className="mb-3"
        >
          <Nav.Item>
            <Nav.Link eventKey="excel">{t('Excel Import')}</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="media">{t('Upload Media')}</Nav.Link>
          </Nav.Item>
        </Nav>

        {/* ══════════════════════════════════════════════════════════════════
            Excel Import tab
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'excel' && (
          <>
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
                  onChange={(e) => {
                    const picked = (e.target as HTMLInputElement).files?.[0] || null;
                    if (picked && picked.size > MAX_EXCEL_SIZE_BYTES) {
                      setExcelSizeError(t('Excel file is too large (max 50MB).'));
                      setFile(null);
                      (e.target as HTMLInputElement).value = '';
                    } else {
                      setExcelSizeError(null);
                      setFile(picked);
                    }
                  }}
                  disabled={interventionsImportStore.loading}
                  isInvalid={!!excelSizeError}
                />
                {excelSizeError && <div className="text-danger small mt-1">{excelSizeError}</div>}
                <div className="text-muted small mt-1">
                  {t('The file should contain the intervention sheet (default: Content).')}{' '}
                  <span className="text-muted">
                    {t('ID format')}
                    {': '}
                    <code>3500_web_de</code> {t('(original)')} /&nbsp;
                    <code>30500_vid_pt</code> {t('(self-made)')}
                    {' — '}
                    {t('formats')}
                    {': '}
                    <code>vid, img, pdf, web, aud, app, br, gfx</code>
                    {' — '}
                    {t('languages')}
                    {': '}
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
                      const errorsCount =
                        r.errors_count ??
                        (r.errors || []).filter((e: any) => e.severity !== 'warning').length;
                      const warningsCount =
                        r.warnings ??
                        (r.errors || []).filter((e: any) => e.severity === 'warning').length;
                      return (
                        <>
                          {errorsCount > 0 && (
                            <Badge bg="danger">
                              {t('Errors')}: {errorsCount}
                            </Badge>
                          )}
                          {warningsCount > 0 && (
                            <Badge bg="warning" text="dark">
                              {t('Warnings')}: {warningsCount}
                            </Badge>
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
                      <div
                        style={{ maxHeight: 260, overflowY: 'auto' }}
                        className="border rounded p-2"
                      >
                        {(r.errors || []).slice(0, 200).map((e: any, idx: number) => {
                          const isWarning = e.severity === 'warning';
                          return (
                            <div key={idx} className="small mb-2">
                              <div className="d-flex align-items-center gap-2 flex-wrap">
                                <Badge
                                  bg={isWarning ? 'warning' : 'danger'}
                                  text={isWarning ? 'dark' : undefined}
                                >
                                  {isWarning ? t('Warning') : t('Error')}
                                </Badge>
                                <span>
                                  <strong>{t('Row')}:</strong> {e.row ?? '-'}{' '}
                                  <strong className="ms-2">{t('ID')}:</strong>{' '}
                                  <code>{e.intervention_id ?? e.external_id ?? '-'}</code>
                                </span>
                              </div>
                              <div
                                className={`mt-1 ${isWarning ? 'text-warning-emphasis' : 'text-danger'}`}
                              >
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
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Upload Videos tab
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'media' && (
          <>
            {interventionsMediaUploadStore.error && (
              <Alert variant="danger" role="alert">
                {interventionsMediaUploadStore.error}
              </Alert>
            )}

            {/* Naming-convention help text */}
            <div className="border rounded p-3 mb-3 bg-light small">
              <div className="fw-semibold mb-1">{t('Naming convention')}</div>
              <p className="mb-1">
                {t('Each filename must encode the intervention ID, format, and language:')}
              </p>
              <p className="mb-1">
                <code>
                  {'{4-5 digits}'}_{'{format}'}_{'{lang}'}.{'{ext}'}
                </code>
                {'  '}— e.g. <code>3500_web_de.mp4</code>, <code>3500_aud_de.mp3</code>,{' '}
                <code>3500_pdf_de.pdf</code>, <code>3500_img_de.jpg</code>
              </p>
              <div>
                {t('Valid format codes')}: <code>vid, img, pdf, web, aud, app, br, gfx</code>
                {'  ·  '}
                {t('Valid languages')}: <code>de, fr, it, pt, nl, en</code>
                {'  ·  '}
                {t('Valid extensions')}: <code>mp4, mp3, wav, pdf, jpg, jpeg, png</code>
              </div>
              <div className="mt-1 text-muted">
                {t(
                  'The language suffix (e.g. _de) determines which language variant receives the file. Only the matching language variant is updated.'
                )}
              </div>
            </div>

            {/* Drag-and-drop zone */}
            <div
              className="border rounded p-4 mb-3 text-center"
              style={{ borderStyle: 'dashed', cursor: 'pointer', borderWidth: 2 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleMediaDrop}
              onClick={() => document.getElementById('media-file-input')?.click()}
              role="button"
              aria-label={t('Drop zone for media files')}
            >
              <div className="text-muted">{t('Drag & drop files here, or click to browse')}</div>
              <div className="text-muted" style={{ fontSize: '0.8em' }}>
                mp4 · mp3 · wav · pdf · jpg · png
              </div>
              <Form.Control
                id="media-file-input"
                type="file"
                multiple
                accept={`${ACCEPTED_EXTENSIONS},${ACCEPTED_MIME}`}
                style={{ display: 'none' }}
                onChange={handleMediaFilesChange}
                disabled={interventionsMediaUploadStore.loading}
              />
            </div>

            {/* Per-file validation list */}
            {validatedMediaFiles.length > 0 && (
              <div
                className="border rounded p-2 mb-3"
                style={{ maxHeight: 240, overflowY: 'auto' }}
              >
                {validatedMediaFiles.map((vf, idx) => (
                  <div
                    key={idx}
                    className="d-flex align-items-center gap-2 mb-1 small"
                    data-testid="video-file-row"
                  >
                    {vf.valid && !vf.tooLarge ? (
                      <Badge bg="success" title={t('Valid filename')}>
                        ✓
                      </Badge>
                    ) : vf.valid && vf.tooLarge ? (
                      <Badge bg="warning" text="dark" title={t('File too large')}>
                        ⚠
                      </Badge>
                    ) : (
                      <Badge bg="danger" title={t('Invalid filename')}>
                        ✗
                      </Badge>
                    )}

                    <span className="text-break flex-grow-1">{vf.file.name}</span>

                    {vf.valid && vf.externalId && !vf.tooLarge && (
                      <span className="text-muted text-nowrap">
                        id: <code>{vf.externalId}</code>
                      </span>
                    )}
                    {!vf.valid && (
                      <span className="text-danger text-nowrap">
                        {t('Invalid filename format')}
                      </span>
                    )}
                    {vf.tooLarge && (
                      <span className="text-warning-emphasis text-nowrap">
                        {t('File too large')} ({formatMB(vf.file.size)}&thinsp;/&thinsp;
                        {vf.maxSizeMB}&thinsp;MB max)
                      </span>
                    )}

                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 ms-1 text-muted"
                      onClick={() => removeMediaFile(idx)}
                      aria-label={t('Remove file')}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload results */}
            {vr && (
              <div className="border rounded p-3">
                <div className="fw-semibold mb-2">{t('Upload results')}</div>
                <div className="d-flex flex-wrap gap-2 mb-2">
                  <Badge bg="success">
                    {t('OK')}: {vr.filter((r) => r.status === 'ok').length}
                  </Badge>
                  <Badge bg="danger">
                    {t('Errors')}: {vr.filter((r) => r.status === 'error').length}
                  </Badge>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {vr.map((res: MediaUploadFileResult, idx: number) => (
                    <div key={idx} className="small mb-2">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <Badge bg={res.status === 'ok' ? 'success' : 'danger'}>
                          {res.status === 'ok' ? t('OK') : t('Error')}
                        </Badge>
                        <code className="text-break">{res.filename}</code>
                        {res.external_id && (
                          <span className="text-muted">
                            id: <code>{res.external_id}</code>
                            {(res as any).language && (
                              <>
                                {' '}
                                · lang: <code>{(res as any).language}</code>
                              </>
                            )}
                          </span>
                        )}
                        {res.status === 'ok' && (
                          <span className="text-success ms-auto text-nowrap">
                            {t('Updated')} {res.interventions_updated.length} {t('intervention(s)')}
                          </span>
                        )}
                      </div>
                      {res.error && <div className="text-danger mt-1">{res.error}</div>}
                      <hr className="my-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">
        <Button
          variant="outline-secondary"
          onClick={close}
          disabled={interventionsImportStore.loading || interventionsMediaUploadStore.loading}
        >
          {t('Close')}
        </Button>

        {activeTab === 'excel' && (
          <Button variant="primary" onClick={submitExcel} disabled={!canSubmit}>
            {interventionsImportStore.loading ? (
              <span className="d-inline-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" /> {t('Importing...')}
              </span>
            ) : (
              t('Import')
            )}
          </Button>
        )}

        {activeTab === 'media' && (
          <Button
            variant="primary"
            onClick={submitMedia}
            disabled={!hasValidMediaFiles || interventionsMediaUploadStore.loading}
          >
            {interventionsMediaUploadStore.loading ? (
              <span className="d-inline-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" /> {t('Uploading...')}
              </span>
            ) : (
              t('Upload')
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
});

export default ImportInterventionsModal;
