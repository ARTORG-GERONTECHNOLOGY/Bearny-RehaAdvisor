// src/components/PatientPage/PatientInterventionPopUp.tsx
import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row, Badge, Alert } from 'react-bootstrap';
import { generateTagColors, getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import { useTranslation } from 'react-i18next';
import { translateText } from '../../utils/translate';

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface MediaItem {
  // titles from different sources
  title?: string;
  intervention_title?: string;

  content_type?: string;
  description?: string;

  media_file?: string;
  media_url?: string;
  link?: string;

  tags?: string[];
  benefitFor?: string[];

  preview_img?: string;

  // 👇 therapist’s personal instruction for the patient
  notes?: string;
}

interface PatientInterventionPopUpProps {
  show: boolean;
  item: MediaItem;
  handleClose: () => void;
}

const PatientInterventionPopUp: React.FC<PatientInterventionPopUpProps> = ({
  show,
  item,
  handleClose,
}) => {
  const { t, i18n } = useTranslation();
  const userLang = i18n.language || 'en';

  const baseTitle = (item.title || item.intervention_title || '').trim();
  const baseDesc = (item.description || '').trim();
  const tagColors = generateTagColors(item.tags || []);

  const [translatedTitle, setTranslatedTitle] = useState(baseTitle);
  const [translatedDescription, setTranslatedDescription] = useState(baseDesc);
  const [detectedLangTitle, setDetectedLangTitle] = useState('');
  const [detectedLangDesc, setDetectedLangDesc] = useState('');

  useEffect(() => {
    if (!show) return;

    (async () => {
      // Title
      if (baseTitle) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(baseTitle, userLang);
          setTranslatedTitle(translatedText || baseTitle);
          setDetectedLangTitle(detectedSourceLanguage || '');
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
          setDetectedLangDesc(detectedSourceLanguage || '');
        } catch {
          setTranslatedDescription(baseDesc);
          setDetectedLangDesc('');
        }
      } else {
        setTranslatedDescription('');
        setDetectedLangDesc('');
      }
    })();
  }, [show, baseTitle, baseDesc, userLang]);

  const renderMediaContent = () => {
    const source = item.media_file || item.media_url || item.link;
    if (!source) return <p className="text-muted m-0">{t('No media available')}</p>;

    const type = getMediaTypeLabelFromUrl(item.media_file || item.media_url, item.link);

    switch (type) {
      case 'Video':
        return (
          <div className="rounded shadow-sm overflow-hidden">
            <ReactPlayer url={String(source)} width="100%" height="400px" controls />
          </div>
        );
      case 'Audio':
        return <ReactAudioPlayer src={String(source)} controls />;
      case 'PDF':
        return (
          <div className="pdf-preview text-center">
            <Document file={item.media_url || item.media_file} loading={<p>{t('Loading')}</p>}>
              <Page pageNumber={1} width={300} />
            </Document>
            <a
              href={item.media_url || item.media_file}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary mt-2"
              title={t('Open full PDF in new tab')}
            >
              {t('Open PDF')}
            </a>
          </div>
        );
      case 'Image':
        return <img src={String(source)} alt={t('Intervention')} className="img-fluid rounded shadow" />;
      case 'Link':
        return <Microlink url={String(source)} style={{ width: '100%', borderRadius: 10, marginTop: 10 }} />;
      default:
        return (
          <a href={String(source)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            {t('Open Resource')}
          </a>
        );
    }
  };

  const personalNote = (item.notes || '').trim();

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>
          <h2 className="mb-0">
            {translatedTitle || t('Intervention')}
            {detectedLangTitle && (
              <small className="text-muted"> ({t('Original language:')} {detectedLangTitle})</small>
            )}
          </h2>
          {item.content_type && <h6 className="text-muted">{t(item.content_type)}</h6>}

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
                  title={t('Category')}
                  style={{ backgroundColor: tagColors[tag] || 'grey', color: 'white' }}
                  className="me-1"
                >
                  {t(tag)}
                </Badge>
              ))}
            </div>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Personal instructions from therapist */}
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
              <p className="text-muted mb-0">
                {translatedDescription}
                {detectedLangDesc && (
                  <span className="ms-2 text-secondary">
                    ({t('Original language:')} {detectedLangDesc})
                  </span>
                )}
              </p>
            </Col>
          </Row>
        )}

        <Row className="pb-3 mb-3">
          <Col md={12}>
            <h5>{t('Media')}</h5>
            <ListGroup variant="flush">
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
