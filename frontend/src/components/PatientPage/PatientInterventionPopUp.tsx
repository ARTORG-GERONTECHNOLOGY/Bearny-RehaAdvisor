// src/components/PatientPage/PatientInterventionPopUp.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Col, ListGroup, Modal, Row, Badge, Alert, Button, ButtonGroup } from 'react-bootstrap';
import {
  generateTagColors,
  getPlayableUrl,
  getMediaTypeLabelFromUrl,
  type InterventionMedia,
} from '../../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import { useTranslation } from 'react-i18next';
import { translateText } from '../../utils/translate';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PatientPopupItem {
  id?: string;

  // titles from different sources
  title?: string;
  intervention_title?: string;

  content_type?: string;
  description?: string;

  // ✅ NEW model metadata
  language?: string;
  external_id?: string;
  provider?: string;

  // ✅ taxonomy
  aims?: string[];
  tags?: string[];

  // ✅ NEW media list
  media?: InterventionMedia[];

  // legacy single fields (fallback)
  media_file?: string;
  media_url?: string;
  link?: string;

  benefitFor?: string[];
  preview_img?: string;

  // therapist’s personal instruction for the patient
  notes?: string;
}

interface PatientInterventionPopUpProps {
  show: boolean;
  item: PatientPopupItem;
  handleClose: () => void;
}

const PatientInterventionPopUp: React.FC<PatientInterventionPopUpProps> = ({ show, item, handleClose }) => {
  const { t, i18n } = useTranslation();
  const userLang = i18n.language || 'en';

  const baseTitle = (item.title || item.intervention_title || '').trim();
  const baseDesc = (item.description || '').trim();

  // ✅ tag colors only for tags (aims are separate badges)
  const tagColors = generateTagColors(item.tags || []);

  const [translatedTitle, setTranslatedTitle] = useState(baseTitle);
  const [translatedDescription, setTranslatedDescription] = useState(baseDesc);
  const [detectedLangTitle, setDetectedLangTitle] = useState('');
  const [detectedLangDesc, setDetectedLangDesc] = useState('');
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ✅ if multiple media exist, let patient switch between them
  const mediaList: InterventionMedia[] = useMemo(() => {
    const fromList = Array.isArray(item.media) ? item.media : [];
    if (fromList.length) return fromList;

    // fallback legacy single fields
    const source = item.media_file || item.media_url || item.link;
    if (!source) return [];
    return [
      {
        kind: 'external',
        media_type: (getMediaTypeLabelFromUrl(item.media_file || item.media_url, item.link) || 'website').toLowerCase() as any,
        url: String(source),
        title: item.title || item.intervention_title || undefined,
        provider: item.provider || undefined,
      } as any,
    ];
  }, [item]);

  const [activeMediaIdx, setActiveMediaIdx] = useState(0);

  useEffect(() => {
    // reset active media when item changes / modal opens
    if (show) setActiveMediaIdx(0);
  }, [show, item?.id]);

  const activeMedia = mediaList[activeMediaIdx];

  const confirmClose = useCallback(() => {
    handleClose();
  }, [handleClose]);

  useEffect(() => {
    if (!show) return;

    (async () => {
      // Title
      if (baseTitle) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(baseTitle, userLang);
          setTranslatedTitle(translatedText || baseTitle);
          // ✅ only show original lang if it really changed
          const changed =
            (translatedText || '').trim().toLowerCase() !== baseTitle.trim().toLowerCase();
          setDetectedLangTitle(changed ? detectedSourceLanguage || '' : '');
        } catch {
          setTranslatedTitle(baseTitle);
          setDetectedLangTitle('');
        }
      } else {
        setTranslatedTitle('');
        setDetectedLangTitle('');
      }

      // Description
      if (baseDesc) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(baseDesc, userLang);
          setTranslatedDescription(translatedText || baseDesc);
          const changed =
            (translatedText || '').trim().toLowerCase() !== baseDesc.trim().toLowerCase();
          setDetectedLangDesc(changed ? detectedSourceLanguage || '' : '');
        } catch {
          setTranslatedDescription(baseDesc);
          setDetectedLangDesc('');
        }
      } else {
        setTranslatedDescription('');
        setDetectedLangDesc('');
      }

      setPdfError(null);
    })();
  }, [show, baseTitle, baseDesc, userLang]);

  const renderMediaContent = () => {
    if (!activeMedia) {
      return <p className="text-muted m-0">{t('No media available')}</p>;
    }

    const playable = getPlayableUrl(activeMedia as any) || (activeMedia as any)?.url || (activeMedia as any)?.media_url;
    if (!playable) return <p className="text-muted m-0">{t('No media available')}</p>;

    const type =
      (activeMedia.media_type ? String(activeMedia.media_type) : '') ||
      getMediaTypeLabelFromUrl(undefined as any, playable);

    switch (String(type).toLowerCase()) {
      case 'video':
        return (
          <div className="rounded shadow-sm overflow-hidden">
            <ReactPlayer url={String(playable)} width="100%" height="400px" controls />
          </div>
        );

      case 'audio':
        return <ReactAudioPlayer src={String(playable)} controls style={{ width: '100%' }} />;

      case 'pdf':
        return (
          <div className="pdf-preview text-center">
            {pdfError ? (
              <Alert variant="warning" className="mb-2">
                {pdfError}
              </Alert>
            ) : null}

            <Document
              file={String(playable)}
              loading={<p className="m-0">{t('Loading')}</p>}
              onLoadError={(err) => {
                console.error('PDF load error:', err);
                setPdfError(t('Could not load PDF preview.'));
              }}
            >
              <Page
                pageNumber={1}
                width={320}
                onRenderError={(err) => {
                  console.error('PDF render error:', err);
                  setPdfError(t('Could not render PDF preview.'));
                }}
              />
            </Document>

            <a
              href={String(playable)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary mt-2"
              title={t('Open full PDF in new tab')}
            >
              {t('Open PDF')}
            </a>
          </div>
        );

      case 'image':
        return <img src={String(playable)} alt={t('Intervention')} className="img-fluid rounded shadow" />;

      case 'website':
      case 'app':
      case 'link':
      case 'text':
      default:
        return <Microlink url={String(playable)} style={{ width: '100%', borderRadius: 10, marginTop: 10 }} />;
    }
  };

  const personalNote = (item.notes || '').trim();

  return (
    <Modal
      show={show}
      onHide={confirmClose}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      size="lg"
      backdrop="static"
      keyboard
    >
      <Modal.Header closeButton>
        <Modal.Title className="w-100">
          <div className="d-flex flex-column gap-1">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <h2 className="mb-0">{translatedTitle || t('Intervention')}</h2>
              {detectedLangTitle && (
                <small className="text-muted">
                  ({t('Translated from')}: {detectedLangTitle})
                </small>
              )}
            </div>

            {item.content_type ? <h6 className="text-muted mb-0">{t(item.content_type)}</h6> : null}

            {/* ✅ metadata chips (optional) */}
            <div className="d-flex flex-wrap gap-2 mt-1">
              {item.language ? (
                <Badge bg="secondary">{String(item.language).toUpperCase()}</Badge>
              ) : null}
              {item.external_id ? (
                <Badge bg="secondary">external_id: {item.external_id}</Badge>
              ) : null}
              {item.provider ? (
                <Badge bg="secondary">{t('Provider')}: {item.provider}</Badge>
              ) : null}
            </div>

            {/* ✅ aims (separate from tags) */}
            {!!(item.aims || []).length && (
              <div className="mt-2 d-flex flex-wrap gap-2">
                {(item.aims || []).map((aim) => (
                  <Badge key={aim} bg="primary" className="me-1" title={t('Aim')}>
                    {t(aim)}
                  </Badge>
                ))}
              </div>
            )}

            {!!item.benefitFor?.length && (
              <div className="mt-2 d-flex flex-wrap gap-2">
                {item.benefitFor.map((benefit) => (
                  <Badge key={benefit} bg="info" className="me-1" title={t('Targeted benefit')}>
                    {t(benefit)}
                  </Badge>
                ))}
              </div>
            )}

            {!!item.tags?.length && (
              <div className="mt-2 d-flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge
                    key={tag}
                    title={t('Tag')}
                    style={{ backgroundColor: tagColors[tag] || 'grey', color: 'white' }}
                    className="me-1"
                  >
                    {t(tag)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {personalNote && (
          <Alert variant="info" className="mb-3">
            <div className="fw-semibold mb-1">{t('Personal instructions')}</div>
            <div className="mb-0">{personalNote}</div>
            <div className="text-muted small">{t('Added by your therapist')}</div>
          </Alert>
        )}

        {!!translatedDescription && (
          <Row className="pb-3 mb-3 border-bottom">
            <Col>
              <h5>{t('Description')}</h5>
              <p className="text-muted mb-0">{translatedDescription}</p>
              {detectedLangDesc && (
                <div className="text-secondary small mt-1">
                  ({t('Translated from')}: {detectedLangDesc})
                </div>
              )}
            </Col>
          </Row>
        )}

        <Row className="pb-3 mb-3">
          <Col md={12}>
            <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <h5 className="mb-0">{t('Media')}</h5>

              {/* ✅ media selector when multiple */}
              {mediaList.length > 1 ? (
                <ButtonGroup size="sm" aria-label={t('Select media')}>
                  {mediaList.slice(0, 6).map((m, idx) => {
                    const label = (m.title || '').trim() || `${t('Item')} ${idx + 1}`;
                    const active = idx === activeMediaIdx;
                    return (
                      <Button
                        key={`${idx}-${label}`}
                        variant={active ? 'primary' : 'outline-secondary'}
                        onClick={() => setActiveMediaIdx(idx)}
                        title={label}
                      >
                        {idx + 1}
                      </Button>
                    );
                  })}
                </ButtonGroup>
              ) : null}
            </div>

            {activeMedia?.title ? (
              <div className="text-muted small mt-1">{activeMedia.title}</div>
            ) : null}

            <ListGroup variant="flush" className="mt-2">
              <ListGroup.Item className="text-center">{renderMediaContent()}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>

      <Modal.Footer />
    </Modal>
  );
};

export default PatientInterventionPopUp;
