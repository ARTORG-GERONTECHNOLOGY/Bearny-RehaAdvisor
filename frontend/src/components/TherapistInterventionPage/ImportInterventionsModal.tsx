// src/components/TherapistInterventionPage/ImportInterventionsModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Badge } from 'react-bootstrap';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import interventionsConfig from '../../config/interventions.json';
import { interventionsImportStore } from '@/stores/interventionsImportStore';
import {
  MAX_MEDIA_UPLOAD_BATCH_MB,
  interventionsMediaUploadStore,
  MediaUploadFileResult,
} from '@/stores/interventionsMediaUploadStore';
import { Button } from '@/components/ui/button';

type Props = {
  show: boolean;
  onHide: () => void;
  /** Called after a successful import (e.g., refresh library store) */
  onSuccess?: () => void;
};

// Client-side filename validation — mirrors backend _FILENAME_RE exactly.
// Matches: {4-5 digits}_{format}_{lang}[_{slot}].{ext}
// e.g. 3500_web_de.mp4    → external_id = 3500_web
//      3500_web_de_2.mp4  → external_id = 3500_web  (slot 2)
//      3500_aud_de.mp3    → external_id = 3500_aud
//      3500_pdf_de.pdf    → external_id = 3500_pdf
const FILE_NAME_RE =
  /^(\d{4,5}_(?:vid|img|pdf|web|aud|app|br|gfx)_[a-z]{2}(?:_\d+)?)\.(mp4|mp3|m4a|wav|pdf|jpg|jpeg|png)$/i;

const ACCEPTED_EXTENSIONS = '.mp4,.mp3,.m4a,.wav,.pdf,.jpg,.jpeg,.png';
const ACCEPTED_MIME =
  'video/mp4,audio/mpeg,audio/mp4,audio/wav,application/pdf,image/jpeg,image/png';

const MAX_FILE_SIZE_MB = MAX_MEDIA_UPLOAD_BATCH_MB;
const MAX_EXCEL_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function getMaxSizeMB(): number {
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
  const maxSizeMB = getMaxSizeMB();
  const tooLarge = file.size > maxSizeMB * 1024 * 1024;
  const m = FILE_NAME_RE.exec(file.name);
  if (!m) return { file, valid: false, externalId: null, tooLarge, maxSizeMB };
  // Derive external_id: strip optional trailing slot number then language suffix
  // e.g. 40500_vid_de_2 → strip '2' → 40500_vid_de → strip 'de' → 40500_vid
  const parts = m[1].toLowerCase().split('_');
  const withoutSlot = /^\d+$/.test(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;
  const externalId =
    withoutSlot.length >= 2 ? withoutSlot.slice(0, -1).join('_') : withoutSlot.join('_');
  return { file, valid: true, externalId, tooLarge, maxSizeMB };
}

const ImportInterventionsModal: React.FC<Props> = observer(({ show, onHide, onSuccess }) => {
  const { t, i18n } = useTranslation();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'excel' | 'media'>('excel');

  // ── Excel tab state ────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [excelSizeError, setExcelSizeError] = useState<string | null>(null);

  const defaultSheet = (interventionsConfig as any)?.importDefaults?.sheetName || 'Content';
  const defaultLangFromCfg =
    (interventionsConfig as any)?.importDefaults?.defaultLang ||
    i18n.language.slice(0, 2).toLowerCase() ||
    'en';

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
  }, [show]);

  // ── Excel helpers ──────────────────────────────────────────────────────────
  const canSubmit = useMemo(
    () => !!file && !excelSizeError && !interventionsImportStore.loading,
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
  const uploadableMediaFiles = validatedMediaFiles.filter((vf) => vf.valid && !vf.tooLarge);
  const hasValidMediaFiles = uploadableMediaFiles.length > 0;
  const uploadableTotalBytes = uploadableMediaFiles.reduce((sum, vf) => sum + vf.file.size, 0);

  const handleMediaFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setVideoFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...picked.filter((f) => !existingNames.has(f.name))];
    });
    // Reset input value so the same file can be re-selected after removal
    e.target.value = '';
  };

  const ACCEPTED_EXTS_SET = new Set(['mp4', 'mp3', 'm4a', 'wav', 'pdf', 'jpg', 'jpeg', 'png']);

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
    const filesToUpload = uploadableMediaFiles.map((vf) => vf.file);
    if (filesToUpload.length === 0) return;
    await interventionsMediaUploadStore.uploadMedia(filesToUpload);
  };

  const r = interventionsImportStore.result;
  const vr = interventionsMediaUploadStore.results;

  return (
    <Dialog open={show} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-3xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('Import interventions')}</DialogTitle>
        </DialogHeader>

        {/* ── Tab switcher ── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (v === 'excel' || v === 'media') setActiveTab(v);
          }}
          className="mb-3"
        >
          <TabsList>
            <TabsTrigger value="excel">{t('Excel Import')}</TabsTrigger>
            <TabsTrigger value="media">{t('Upload Media')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ══════════════════════════════════════════════════════════════════
            Excel Import tab
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'excel' && (
          <>
            {interventionsImportStore.error && (
              <Alert variant="destructive">
                {interventionsImportStore.errorCode === 'sheet_not_found' ? (
                  <>
                    {t('Sheet not found in the Excel file.')}
                    {interventionsImportStore.availableSheets.length > 0 && (
                      <span>
                        {' '}
                        {t('Available sheets:')}{' '}
                        <strong>{interventionsImportStore.availableSheets.join(', ')}</strong>
                      </span>
                    )}
                  </>
                ) : interventionsImportStore.errorCode === 'missing_column' ? (
                  t('Required column missing in the Excel file.')
                ) : (
                  interventionsImportStore.error
                )}
              </Alert>
            )}

            <form>
              <Field className="mb-3">
                <FieldLabel htmlFor="excel-file-input" className="fw-semibold">
                  {t('Excel file (.xlsx / .xlsm / .csv)')}
                </FieldLabel>
                <Input
                  id="excel-file-input"
                  type="file"
                  accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
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
                />
                {excelSizeError && <FieldError>{excelSizeError}</FieldError>}
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
                <div className="text-muted small mt-1">{t('multiMediaExcelInfo')}</div>
              </Field>

              <div className="border rounded p-3 mb-3">
                <div className="fw-semibold mb-2">{t('Options')}</div>

                <div className="d-flex flex-wrap gap-3">
                  <Field style={{ minWidth: 220 }}>
                    <FieldLabel htmlFor="import-sheet-name" className="fw-semibold">
                      {t('Sheet name')}
                    </FieldLabel>
                    <Input
                      id="import-sheet-name"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      disabled={interventionsImportStore.loading}
                      placeholder={defaultSheet}
                    />
                  </Field>

                  <Field style={{ minWidth: 160 }}>
                    <FieldLabel htmlFor="import-default-lang" className="fw-semibold">
                      {t('Default language')}
                    </FieldLabel>
                    <Select
                      value={defaultLang}
                      onValueChange={(value) => setDefaultLang(value)}
                      disabled={interventionsImportStore.loading}
                    >
                      <SelectTrigger id="import-default-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">EN</SelectItem>
                        <SelectItem value="de">DE</SelectItem>
                        <SelectItem value="fr">FR</SelectItem>
                        <SelectItem value="it">IT</SelectItem>
                        <SelectItem value="pt">PT</SelectItem>
                        <SelectItem value="nl">NL</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field style={{ minWidth: 140 }}>
                    <FieldLabel htmlFor="import-limit" className="fw-semibold">
                      {t('Limit')}
                    </FieldLabel>
                    <Input
                      id="import-limit"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      disabled={interventionsImportStore.loading}
                      placeholder={t('Optional')}
                      inputMode="numeric"
                    />
                    <div className="text-muted small">{t('Import only first N rows')}</div>
                  </Field>
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
            </form>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Upload Videos tab
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'media' && (
          <>
            {interventionsMediaUploadStore.error && (
              <Alert variant="destructive">{interventionsMediaUploadStore.error}</Alert>
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
                {t('Valid extensions')}: <code>mp4, mp3, m4a, wav, pdf, jpg, jpeg, png</code>
              </div>
              <div className="mt-1 text-muted">
                {t(
                  'The language suffix (e.g. _de) determines which language variant receives the file. Only the matching language variant is updated.'
                )}
              </div>
              <div className="mt-2 border-top pt-2">
                <span className="fw-semibold">{t('Multiple media per intervention')}:</span>{' '}
                {t('multiMediaFileUploadInfo')}
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
                mp4 · mp3 · m4a · wav · pdf · jpg · png
              </div>
              <Input
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
                      size="dashboard"
                      variant="ghost"
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

            {validatedMediaFiles.length > 0 && (
              <div className="text-muted small mb-3" data-testid="media-upload-summary">
                {hasValidMediaFiles
                  ? t(
                      'Ready to upload {{count}} file(s), {{size}} MB total. Large selections are uploaded in smaller batches automatically.',
                      {
                        count: uploadableMediaFiles.length,
                        size: formatMB(uploadableTotalBytes),
                      }
                    )
                  : t('No valid files are ready to upload.')}
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

        <DialogFooter className="sm:justify-between">
          <Button
            size="dashboard"
            variant="secondary"
            onClick={close}
            disabled={interventionsImportStore.loading || interventionsMediaUploadStore.loading}
          >
            {t('Close')}
          </Button>

          {activeTab === 'excel' && (
            <Button size="dashboard" onClick={submitExcel} disabled={!canSubmit}>
              {interventionsImportStore.loading ? (
                <span className="d-inline-flex align-items-center gap-2">
                  <Spinner /> {t('Importing...')}
                </span>
              ) : (
                t('Import')
              )}
            </Button>
          )}

          {activeTab === 'media' && (
            <Button
              size="dashboard"
              onClick={submitMedia}
              disabled={!hasValidMediaFiles || interventionsMediaUploadStore.loading}
            >
              {interventionsMediaUploadStore.loading ? (
                <span className="d-inline-flex align-items-center gap-2">
                  <Spinner /> {t('Uploading...')}
                </span>
              ) : (
                t('Upload')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default ImportInterventionsModal;
