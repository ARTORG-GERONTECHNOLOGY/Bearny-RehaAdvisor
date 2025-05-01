import React from 'react';
import { Col, ListGroup, Modal, Row, Badge } from 'react-bootstrap';
import { generateTagColors, getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import { useTranslation } from 'react-i18next';
// Load PDF worker for inline PDF previews
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// Define interface above component
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
  const tagColors = generateTagColors(item.tags || []);

  const renderMediaContent = () => {
    if (!item.media_file && !item.link) return <p className="text-muted">No media available</p>;

    const mediaType = getMediaTypeLabelFromUrl(item.media_file, item.link);

    switch (mediaType) {
      case 'Video':
        return (
          <div className="rounded shadow-sm overflow-hidden">
            <ReactPlayer url={item.media_file || item.link} width="100%" height="400px" controls />
          </div>
        );
      case 'Audio':
        return <ReactAudioPlayer src={item.media_file || item.link} controls />;
      case 'PDF':
        return (
          <div className="pdf-preview">
            <Document file={item.media_url} loading={<p>L{t('Loading')}</p>}>
              <Page pageNumber={1} width={300} />
            </Document>
            <a
              href={item.media_file}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mt-2"
            >
              {t('Open PDF')}
            </a>
          </div>
        );
      case 'Image':
        return (
          <img src={item.media_file} alt={t('Intervention')} className="img-fluid rounded shadow" />
        );
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
            href={item.link || item.media_file}
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
          <h2>{item.title}</h2>
          <h5 className="text-muted">{item.content_type}</h5>
          {item.benefitFor?.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.benefitFor.map((benefit) => (
                <Badge key={benefit} bg="info" className="me-1">
                  {benefit}
                </Badge>
              ))}
            </div>
          )}
          {item.tags?.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Badge
                  key={tag}
                  style={{ backgroundColor: tagColors[tag] || 'grey', color: 'white' }}
                  className="me-1"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row className="pb-3 mb-3 border-bottom">
          <Col>
            <h5>{t('Description')}</h5>
            <p className="text-muted">{item.description || 'No description provided'}</p>
          </Col>
        </Row>
        <Row className="pb-3 mb-3">
          <Col md={12}>
            <h5>{t('Media')}</h5>
            <ListGroup variant="flush">
              <ListGroup.Item className="text-center">{renderMediaContent()}</ListGroup.Item>
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer></Modal.Footer>
    </Modal>
  );
};

export default PatientInterventionPopUp;
