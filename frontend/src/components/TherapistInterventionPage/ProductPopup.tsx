// components/TherapistInterventionPage/ProductPopup.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Col,
  Modal,
  Row,
  Badge,
  Button,
  Form,
  Container,
  OverlayTrigger,
  Tooltip,
  ButtonGroup,
  InputGroup,
  Alert,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Document, Page } from 'react-pdf';
import Microlink from '@microlink/react';
import { PlayableMedia } from '../common/PlayableMedia';

import { FaPlus, FaEdit, FaTrash, FaSearch, FaLock } from 'react-icons/fa';
import apiClient from '../../api/client';
import interventionsConfig from '../../config/interventions.json';
import authStore from '../../stores/authStore';
import {
  getTagColor,
  toLangOpts,
  getAllMedia,
  getMediaBadge,
  getPlayableUrl,
} from '../../utils/interventions';
import ErrorAlert from '../common/ErrorAlert';
import TemplateAssignModal from './TemplateAssignModal';
import { translateText } from '../../utils/translate';

type UnknownRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;
const isString = (v: unknown): v is string => typeof v === 'string';
const asString = (v: unknown): string => (isString(v) ? v : '');
const norm = (v: unknown) => asString(v).trim();
const asBool = (v: unknown) => (typeof v === 'boolean' ? v : Boolean(v));

type Props = {
  show: boolean;
  item: unknown;
  handleClose: () => void;
  tagColors: Record<string, string>;
};

// minimal, FE-friendly media type
export type InterventionMedia = {
  kind: 'external' | 'file';
  media_type: 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
  provider?: string | null;
  title?: string | null;
  url?: string | null;
  embed_url?: string | null;
  file_path?: string | null;
  mime?: string | null;
};

type LangOpt = { language: string; title?: string | null };

type PatientTypeChip = {
  type?: unknown;
  diagnosis?: unknown;
  frequency?: unknown;
};

type InterventionLike = UnknownRecord & {
  _id?: string;
  title?: string;
  description?: string;

  duration?: number;
  content_type?: string;

  tags?: unknown;
  benefitFor?: unknown;

  language?: string;
  external_id?: string;
  provider?: string;

  preview_img?: string;

  available_languages?: unknown;

  patient_types?: unknown;

  is_private?: boolean;
  private_patient_id?: string;
  privatePatientId?: string;
};

const getId = (x: unknown): string | null =>
  isRecord(x) && isString(x._id) && x._id.trim() ? x._id.trim() : null;

const isHttpUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
};

const ProductPopup: React.FC<Props> = ({ show, item, handleClose, tagColors }) => {
  const { t, i18n } = useTranslation();

  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'create' | 'modify'>('create');
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string>('');

  const [assignedDiagSet, setAssignedDiagSet] = useState<Set<string>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [error, setError] = useState('');

  // language variants inside modal only
  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(false);

  // local override to switch variants without parent involvement
  const [localOverride, setLocalOverride] = useState<InterventionLike | null>(null);

  const effectiveItem: InterventionLike | null = useMemo(() => {
    const base = isRecord(item) ? (item as InterventionLike) : null;
    return localOverride || base;
  }, [item, localOverride]);

  useEffect(() => {
    if (!show) setLocalOverride(null);
  }, [show]);

  // diagnoses list: kept as you had it (config fallback)
  const diagnosesFromSpec = useMemo(() => {
    const tax = isRecord(interventionsConfig) ? (interventionsConfig as UnknownRecord) : {};
    const itx = isRecord(tax.interventionsTaxonomy)
      ? (tax.interventionsTaxonomy as UnknownRecord)
      : {};
    const arr = itx.primary_diagnoses;
    return Array.isArray(arr) ? arr.map((x) => norm(x)).filter(Boolean) : [];
  }, []);

  const allDiagnoses = useMemo(() => {
    return Array.from(new Set(diagnosesFromSpec.map((d) => norm(d)).filter(Boolean)));
  }, [diagnosesFromSpec]);

  const [diagSearch, setDiagSearch] = useState('');
  const filteredDiagnoses = useMemo(() => {
    const q = diagSearch.trim().toLowerCase();
    return q ? allDiagnoses.filter((d) => d.toLowerCase().includes(q)) : allDiagnoses;
  }, [allDiagnoses, diagSearch]);

  const chunk = useCallback(<T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }, []);

  const hasUnsavedChanges = useMemo(
    () => diagSearch.trim().length > 0 || error.trim().length > 0,
    [diagSearch, error]
  );

  const confirmClose = useCallback(() => {
    if (assignOpen) {
      setAssignOpen(false);
      return;
    }
    if (hasUnsavedChanges) {
      const ok = window.confirm(t('Close this window?'));
      if (!ok) return;
    }
    setError('');
    setDiagSearch('');
    setLangOptions([]);
    handleClose();
  }, [assignOpen, handleClose, hasUnsavedChanges, t]);

  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, confirmClose]);

  // preferred app language → pick variant ordering hint (UI only)
  const preferredLang = useMemo(() => {
    const l = (i18n?.language || '').slice(0, 2).toLowerCase();
    return l || 'en';
  }, [i18n?.language]);

  // populate language options from LIST response: item.available_languages
  useEffect(() => {
    if (!show) return;
    if (!effectiveItem) {
      setLangOptions([]);
      return;
    }

    const current = String(effectiveItem.language || '')
      .trim()
      .toLowerCase();
    const raw = effectiveItem.available_languages ?? [];
    const opts = toLangOpts(raw, effectiveItem.title);

    const merged = [
      ...(current ? [{ language: current, title: effectiveItem.title }] : []),
      ...opts,
    ].reduce((acc: LangOpt[], cur: LangOpt) => {
      const key = (cur.language || '').toLowerCase();
      if (!key) return acc;
      if (!acc.find((a) => (a.language || '').toLowerCase() === key)) acc.push(cur);
      return acc;
    }, []);

    setLangOptions(merged);
  }, [show, effectiveItem]);

  const sortedLangOptions = useMemo(() => {
    const opts = [...(langOptions || [])].filter((x) => x?.language);
    const score = (l: string) => {
      const ll = (l || '').toLowerCase();
      if (ll === preferredLang) return 0;
      if (ll === 'en') return 1;
      if (ll === 'de') return 2;
      return 3;
    };
    return opts.sort(
      (a, b) => score(a.language) - score(b.language) || a.language.localeCompare(b.language)
    );
  }, [langOptions, preferredLang]);

  // switch variant by external_id + lang:
  // GET interventions/all/?external_id=4001&lang=it  -> [ { ...variant... } ]
  const switchVariantByLang = useCallback(
    async (lang: string) => {
      if (!effectiveItem) return;

      const ext = String(effectiveItem.external_id || '').trim();
      const nextLang = String(lang || '')
        .toLowerCase()
        .trim();
      const current = String(effectiveItem.language || '')
        .toLowerCase()
        .trim();

      if (!ext || !nextLang) return;
      if (nextLang === current) return;

      try {
        setLoadingLangs(true);

        const res = await apiClient.get('interventions/all/', {
          params: { external_id: ext, lang: nextLang },
        });

        const data = res.data;
        const arr = Array.isArray(data)
          ? data
          : isRecord(data) && Array.isArray(data.data)
            ? (data.data as unknown[])
            : [];
        const next = arr?.[0];

        if (isRecord(next)) {
          setLocalOverride(next as InterventionLike);
        }
      } catch {
        // ignore
      } finally {
        setLoadingLangs(false);
      }
    },
    [effectiveItem]
  );

  // translation follows effectiveItem (supports variant switching)
  useEffect(() => {
    const run = async () => {
      if (!effectiveItem) {
        setTranslatedText('');
        setTranslatedTitle('');
        setDetectedLang('');
        setTitleLang('');
        return;
      }

      try {
        if (effectiveItem.description) {
          const { translatedText: tx, detectedSourceLanguage } = await translateText(
            String(effectiveItem.description)
          );
          setTranslatedText(tx);
          setDetectedLang(tx !== effectiveItem.description ? detectedSourceLanguage : '');
        } else {
          setTranslatedText('');
          setDetectedLang('');
        }

        if (effectiveItem.title) {
          const { translatedText: tt, detectedSourceLanguage: tl } = await translateText(
            String(effectiveItem.title)
          );
          setTranslatedTitle(tt);
          setTitleLang(tt !== effectiveItem.title ? tl : '');
        } else {
          setTranslatedTitle('');
          setTitleLang('');
        }
      } catch {
        setTranslatedText(String(effectiveItem.description || ''));
        setTranslatedTitle(String(effectiveItem.title || ''));
        setDetectedLang('');
        setTitleLang('');
      }
    };

    if (show) void run();
  }, [effectiveItem, show]);

  const refreshAssignments = useCallback(async () => {
    const interventionId = getId(effectiveItem);
    if (!show || !interventionId) return;

    try {
      setLoadingAssignments(true);
      const qs = new URLSearchParams({ horizon: '365' }).toString();
      const res = await apiClient.get(`therapists/${authStore.id}/template-plan?${qs}`);

      const data = res.data;
      const itemsRaw = isRecord(data) && Array.isArray(data.items) ? (data.items as unknown[]) : [];

      const set = new Set<string>();
      for (const it of itemsRaw) {
        if (!isRecord(it)) continue;
        const intervention = it.intervention;
        const diag = it.diagnosis;

        const itInterventionId =
          isRecord(intervention) && isString(intervention._id) ? intervention._id : null;

        if (itInterventionId === interventionId && isString(diag) && diag.trim()) {
          set.add(diag);
        }
      }

      setAssignedDiagSet(set);
    } catch {
      setAssignedDiagSet(new Set());
    } finally {
      setLoadingAssignments(false);
    }
  }, [effectiveItem, show]);

  useEffect(() => {
    void refreshAssignments();
  }, [refreshAssignments]);

  const openAssign = useCallback(
    (diag: string) => {
      setSelectedDiagnosis(diag);
      setAssignMode(assignedDiagSet.has(diag) ? 'modify' : 'create');
      setAssignOpen(true);
    },
    [assignedDiagSet]
  );

  const removeFromTemplate = useCallback(
    async (diag: string) => {
      const interventionId = getId(effectiveItem);
      if (!interventionId) return;

      try {
        await apiClient.post(
          `therapists/${authStore.id}/interventions/remove-from-patient-types/`,
          {
            diagnosis: diag,
            intervention_id: interventionId,
            therapist: authStore.id,
          }
        );
        await refreshAssignments();
      } catch (e: unknown) {
        const msg =
          (isRecord(e) &&
            isRecord(e.response) &&
            isRecord(e.response.data) &&
            (asString(e.response.data.error) || asString(e.response.data.message))) ||
          (isRecord(e) && asString(e.message)) ||
          t('Failed to delete from template.');
        setError(msg);
      }
    },
    [effectiveItem, refreshAssignments, t]
  );

  const effectiveMediaList: InterventionMedia[] = useMemo(() => {
    return effectiveItem ? (getAllMedia(effectiveItem) as InterventionMedia[]) : [];
  }, [effectiveItem]);

  const effectiveMediaBadge = useMemo(() => {
    return getMediaBadge(effectiveMediaList as unknown as InterventionMedia[]);
  }, [effectiveMediaList]);

  const renderOneMedia = (m: InterventionMedia, idx: number) => {
    const label = m.title || `${t('Media')} ${idx + 1}`;
    const playable = getPlayableUrl(m);

    if (!playable) {
      return (
        <div key={idx} className="mb-3">
          <div className="fw-semibold mb-1">{label}</div>
          <div className="text-muted small">
            {t('No playable URL provided for this media item.')}
          </div>
        </div>
      );
    }

    switch (m.media_type) {
      case 'video':
      case 'audio':
      case 'streaming':
        return (
          <div key={idx} className="mb-3">
            <div className="fw-semibold mb-1">{label}</div>
            <PlayableMedia m={m} label={label} />
          </div>
        );

      case 'pdf':
        return (
          <div key={idx} className="mb-3">
            <div className="fw-semibold mb-2">{label}</div>
            <div style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 8 }}>
              <Document file={playable}>
                <Page pageNumber={1} width={320} />
              </Document>
            </div>
            <a
              href={playable}
              className="btn btn-outline-primary mt-2"
              target="_blank"
              rel="noreferrer"
            >
              {t('Open PDF')}
            </a>
          </div>
        );

      case 'image':
        return (
          <div key={idx} className="mb-3">
            <div className="fw-semibold mb-2">{label}</div>
            <img
              src={playable}
              alt={label}
              className="img-fluid rounded"
              style={{ maxHeight: 420, objectFit: 'contain' }}
            />
          </div>
        );

      case 'app':
      case 'website':
      case 'text':
      default:
        if (isHttpUrl(playable)) {
          return (
            <div key={idx} className="mb-3">
              <div className="fw-semibold mb-2">{label}</div>
              <Microlink url={playable} style={{ width: '100%' }} />
            </div>
          );
        }
        return (
          <div key={idx} className="mb-3">
            <div className="fw-semibold mb-1">{label}</div>
            <a
              href={playable}
              className="btn btn-outline-secondary"
              target="_blank"
              rel="noreferrer"
            >
              {t('Open Resource')}
            </a>
          </div>
        );
    }
  };

  const renderMediaContentEffective = () => {
    if (!effectiveMediaList.length)
      return <div className="text-muted">{t('No media available.')}</div>;
    return <div>{effectiveMediaList.map((m, idx) => renderOneMedia(m, idx))}</div>;
  };

  const effectiveIsPrivate = asBool(effectiveItem?.is_private);
  const effectivePrivatePatientId =
    (isString(effectiveItem?.private_patient_id) && effectiveItem?.private_patient_id) ||
    (isString(effectiveItem?.privatePatientId) && effectiveItem?.privatePatientId) ||
    null;

  const effectiveTags: string[] = useMemo(() => {
    const tags = effectiveItem?.tags;
    return Array.isArray(tags) ? tags.map((x) => norm(x)).filter(Boolean) : [];
  }, [effectiveItem]);

  const effectiveBenefits: string[] = useMemo(() => {
    const b = effectiveItem?.benefitFor;
    return Array.isArray(b) ? b.map((x) => norm(x)).filter(Boolean) : [];
  }, [effectiveItem]);

  const effectivePatientTypes: PatientTypeChip[] = useMemo(() => {
    const pt = effectiveItem?.patient_types;
    return Array.isArray(pt) ? (pt as PatientTypeChip[]) : [];
  }, [effectiveItem]);

  if (!effectiveItem) return null;

  return (
    <>
      <Modal
        show={show}
        onHide={confirmClose}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          confirmClose();
        }}
        centered
        size="lg"
        scrollable
        backdrop="static"
        keyboard
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="d-flex align-items-center gap-2 flex-wrap">
            {effectiveIsPrivate && (
              <OverlayTrigger overlay={<Tooltip>{t('Private intervention')}</Tooltip>}>
                <span className="text-muted">
                  <FaLock />
                </span>
              </OverlayTrigger>
            )}

            {titleLang ? (
              <OverlayTrigger overlay={<Tooltip>{String(effectiveItem.title || '')}</Tooltip>}>
                <span>{translatedTitle}</span>
              </OverlayTrigger>
            ) : (
              String(effectiveItem.title || '')
            )}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <ErrorAlert message={error} onClose={() => setError('')} />}

          <Container fluid>
            {/* Language buttons INSIDE modal */}
            {sortedLangOptions.length > 1 && (
              <Row className="mb-3">
                <Col>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h5 className="mb-0">{t('Languages')}</h5>
                    {loadingLangs ? <small className="text-muted">{t('Loading…')}</small> : null}
                  </div>

                  <ButtonGroup className="flex-wrap gap-2">
                    {sortedLangOptions.map((opt) => {
                      const optLang = String(opt.language || '').toLowerCase();
                      const active = optLang === String(effectiveItem.language || '').toLowerCase();
                      return (
                        <Button
                          key={optLang}
                          variant={active ? 'primary' : 'outline-primary'}
                          size="sm"
                          onClick={() => switchVariantByLang(optLang)}
                        >
                          {optLang.toUpperCase()}
                        </Button>
                      );
                    })}
                  </ButtonGroup>
                </Col>
              </Row>
            )}

            <Row className="mb-3">
              <Col xs={12} md={6}>
                <h5>{t('Description')}</h5>
                <p className="text-muted mb-0">
                  {detectedLang ? (
                    <OverlayTrigger
                      overlay={<Tooltip>{String(effectiveItem.description || '')}</Tooltip>}
                    >
                      <span>{translatedText}</span>
                    </OverlayTrigger>
                  ) : (
                    String(effectiveItem.description || '')
                  )}
                </p>

                <div className="mt-3 d-flex flex-wrap gap-2">
                  {effectiveItem.external_id && (
                    <Badge bg="secondary">external_id: {effectiveItem.external_id}</Badge>
                  )}
                  {effectiveItem.language && (
                    <Badge bg="secondary">
                      lang: {String(effectiveItem.language).toUpperCase()}
                    </Badge>
                  )}
                  {effectiveItem.provider && (
                    <Badge bg="secondary">provider: {String(effectiveItem.provider)}</Badge>
                  )}
                  {effectiveIsPrivate && <Badge bg="dark">{t('Private')}</Badge>}
                  {effectiveIsPrivate && effectivePrivatePatientId && (
                    <Badge bg="dark">patient: {String(effectivePrivatePatientId)}</Badge>
                  )}
                  {typeof effectiveItem.duration !== 'undefined' && (
                    <Badge bg="light" text="dark">
                      {t('Duration')}: {String(effectiveItem.duration)} {t('min')}
                    </Badge>
                  )}
                  {effectiveItem.content_type && (
                    <Badge bg="light" text="dark">
                      {t('ContentType')}: {t(String(effectiveItem.content_type))}
                    </Badge>
                  )}
                </div>

                {effectiveItem.preview_img && (
                  <div className="mt-3">
                    <div className="fw-semibold mb-2">{t('Preview')}</div>
                    <img
                      src={String(effectiveItem.preview_img)}
                      alt={t('Preview')}
                      className="img-fluid rounded"
                      style={{ maxHeight: 240, objectFit: 'cover' }}
                    />
                  </div>
                )}
              </Col>

              <Col xs={12} md={6}>
                <div className="d-flex align-items-center justify-content-between">
                  <h5 className="mb-0">{t('Media')}</h5>
                  <Badge
                    bg={String(
                      (effectiveMediaBadge as unknown as { variant?: unknown }).variant ||
                        'secondary'
                    )}
                  >
                    {t(
                      String(
                        (effectiveMediaBadge as unknown as { label?: unknown }).label || 'Media'
                      )
                    )}
                  </Badge>
                </div>
                <div className="mt-2">{renderMediaContentEffective()}</div>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col>
                <h5>{t('Tags & Benefits')}</h5>

                <div className="mb-2">
                  {effectiveTags.map((tag) => (
                    <Badge
                      key={tag}
                      className="me-2 mb-1"
                      style={{
                        backgroundColor: getTagColor(tagColors, tag) || '#888',
                        color: '#fff',
                      }}
                      role="status"
                    >
                      {t(tag)}
                    </Badge>
                  ))}

                  {effectiveBenefits.map((b) => (
                    <Badge key={b} className="me-2 mb-1 bg-info text-dark">
                      {t(b)}
                    </Badge>
                  ))}
                </div>

                {!effectiveIsPrivate && effectivePatientTypes.length > 0 && (
                  <div className="mt-2">
                    <div className="fw-semibold mb-1">{t('Recommended for')}</div>
                    <div className="d-flex flex-wrap gap-2">
                      {effectivePatientTypes.map((pt, idx) => (
                        <Badge key={idx} bg="secondary">
                          {t(norm(pt.type))} • {t(norm(pt.diagnosis))} • {t(norm(pt.frequency))}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Col>
            </Row>

            {!effectiveIsPrivate ? (
              <>
                <Row className="mb-2">
                  <Col className="d-flex align-items-center justify-content-between">
                    <h5 className="mb-0">{t('Add/modify in template by diagnosis')}</h5>
                    <small className="text-muted">
                      {loadingAssignments ? t('Loading assignments…') : null}
                    </small>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col md={6}>
                    <InputGroup>
                      <InputGroup.Text>
                        <FaSearch />
                      </InputGroup.Text>
                      <Form.Control
                        placeholder={t('Search diagnoses')}
                        value={diagSearch}
                        onChange={(e) => setDiagSearch(e.target.value)}
                      />
                    </InputGroup>
                  </Col>
                </Row>

                <div className="diag-scroll" role="region" aria-label={t('Diagnoses')}>
                  <Row className="g-2">
                    {chunk(filteredDiagnoses, 2).map((pair, i) => (
                      <React.Fragment key={i}>
                        {pair.map((d) => {
                          const isAssigned = assignedDiagSet.has(d);
                          return (
                            <Col xs={12} md={6} key={d}>
                              <div className="d-flex align-items-center justify-content-between border rounded px-2 py-2">
                                <div className="me-2">
                                  <div className="fw-semibold">
                                    {d}{' '}
                                    {isAssigned && (
                                      <Badge bg="success" className="ms-1">
                                        {t('Assigned')}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <ButtonGroup size="sm">
                                    <OverlayTrigger
                                      placement="top"
                                      overlay={
                                        <Tooltip>
                                          {isAssigned
                                            ? t('Modify from day…')
                                            : t('Add (Day S → N)')}
                                        </Tooltip>
                                      }
                                    >
                                      <Button
                                        variant={
                                          isAssigned ? 'outline-secondary' : 'outline-success'
                                        }
                                        onClick={() => openAssign(d)}
                                      >
                                        {isAssigned ? <FaEdit /> : <FaPlus />}
                                      </Button>
                                    </OverlayTrigger>

                                    {isAssigned && (
                                      <OverlayTrigger
                                        placement="top"
                                        overlay={<Tooltip>{t('Delete from template')}</Tooltip>}
                                      >
                                        <Button
                                          variant="outline-danger"
                                          onClick={() => void removeFromTemplate(d)}
                                        >
                                          <FaTrash />
                                        </Button>
                                      </OverlayTrigger>
                                    )}
                                  </ButtonGroup>
                                </div>
                              </div>
                            </Col>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    {filteredDiagnoses.length === 0 && (
                      <Col>
                        <div className="text-muted">{t('No diagnoses match your search.')}</div>
                      </Col>
                    )}
                  </Row>
                </div>

                <Row className="mt-3">
                  <Col>
                    <small className="text-muted">
                      {t(
                        'This assigns a relative schedule (Day S → N) to the diagnosis template. Actual calendar dates are chosen when applying the template to a patient.'
                      )}
                    </small>
                  </Col>
                </Row>
              </>
            ) : (
              <Row className="mt-2">
                <Col>
                  <Alert variant="secondary" className="mb-0">
                    {t(
                      'This is a private intervention. Template assignment by diagnosis is disabled.'
                    )}
                  </Alert>
                </Col>
              </Row>
            )}
          </Container>
        </Modal.Body>
      </Modal>

      {assignOpen && !effectiveIsPrivate && (
        <TemplateAssignModal
          show
          onHide={() => setAssignOpen(false)}
          interventionId={getId(effectiveItem)}
          interventionTitle={translatedTitle || effectiveItem?.title}
          diagnoses={allDiagnoses}
          defaultDiagnosis={selectedDiagnosis}
          mode={assignMode}
          onSuccess={refreshAssignments}
        />
      )}

      <style>{`
        .diag-scroll {
          max-height: 360px;
          overflow-y: auto;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 8px;
          background: #fff;
        }
        @media (min-height: 900px) {
          .diag-scroll { max-height: 480px; }
        }
      `}</style>
    </>
  );
};

export default ProductPopup;
