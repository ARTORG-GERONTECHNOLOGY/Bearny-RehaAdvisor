import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row, Badge } from 'react-bootstrap';
import { generateTagColors, getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import { useTranslation } from 'react-i18next';
import { translateText } from '../../utils/translate';

// Setup PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface MediaItem {
  title: string;
  content_type: string;
  description?: string;
  media_file?: string;
  media_url?: string;
  link?: string;
  tags?: string[];
  benefitFor?: string[];
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
  const tagColors = generateTagColors(item.tags || []);

  const [translatedTitle, setTranslatedTitle] = useState(item.title);
  const [translatedDescription, setTranslatedDescription] = useState(item.description || '');
  const [detectedLangTitle, setDetectedLangTitle] = useState('');
  const [detectedLangDesc, setDetectedLangDesc] = useState('');

  useEffect(() => {
    if (!show) return;

    const translateIfNeeded = async () => {
      if (item.title) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(item.title, userLang);
          setTranslatedTitle(translatedText);
          setDetectedLangTitle(detectedSourceLanguage);
        } catch {
          setTranslatedTitle(item.title);
        }
      }

      if (item.description) {
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(item.description, userLang);
          setTranslatedDescription(translatedText);
          setDetectedLangDesc(detectedSourceLanguage);
        } catch {
          setTranslatedDescription(item.description || '');
        }
      }
    };

    translateIfNeeded();
  }, [show, item.title, item.description, userLang]);

  const renderMediaContent = () => {
    const source = item.media_file || item.link;

    if (!source) return <p className="text-muted">{t('No media available')}</p>;

    const type = getMediaTypeLabelFromUrl(item.media_file, item.link);

    switch (type) {
      case 'Video':
        return (
          <div className="rounded shadow-sm overflow-hidden">
            <ReactPlayer url={source} width="100%" height="400px" controls />
          </div>
        );
      case 'Audio':
        return <ReactAudioPlayer src={source} controls />;
      case 'PDF':
        return (
          <div className="pdf-preview text-center">
            <Document file={item.media_url || item.media_file} loading={<p>{t('Loading')}</p>}>
              <Page pageNumber={1} width={300} />
            </Document>
            <a
              href={item.media_file}
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
        return <img src={source} alt={t('Intervention')} className="img-fluid rounded shadow" />;
      case 'Link':
        return (
          <Microlink
            url={item.link}
            style={{ width: '100%', borderRadius: '10px', marginTop: '10px' }}
          />
        );
      default:
        return (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            {t('Open Resource')}
          </a>
        );
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>
          <h2 className="mb-0">
            {translatedTitle}{' '}
            {detectedLangTitle && (
              <small className="text-muted">
                ({t('Original language:')} {detectedLangTitle})
              </small>
            )}
          </h2>
          <h6 className="text-muted">{t(item.content_type)}</h6>

          {/* Benefits */}
          {item.benefitFor?.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.benefitFor.map((benefit) => (
                <Badge key={benefit} bg="info" className="me-1" title={t('Targeted benefit')}>
                  {t(benefit)}
                </Badge>
              ))}
            </div>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Badge
                  key={tag}
                  title={t('Category')}
                  style={{
                    backgroundColor: tagColors[tag] || 'grey',
                    color: 'white',
                  }}
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
        {/* Description */}
        <Row className="pb-3 mb-3 border-bottom">
          <Col>
            <h5>{t('Description')}</h5>
            <p className="text-muted">
              {translatedDescription}
              {detectedLangDesc && (
                <span className="ms-2 text-secondary">
                  ({t('Original language:')} {detectedLangDesc})
                </span>
              )}
            </p>
          </Col>
        </Row>

        {/* Media */}
        <Row className="pb-3 mb-3">
          <Col md={12}>
            <h5>{t('Media')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item className="text-center">{renderMediaContent()}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>

      <Modal.Footer>
        {/* Optionally add close or more actions */}
      </Modal.Footer>
    </Modal>
  );
};

export default PatientInterventionPopUp;
