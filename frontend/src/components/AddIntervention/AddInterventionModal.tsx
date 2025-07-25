import React, { useEffect, useState, useCallback } from 'react';
import { Badge, Button, Col, Form, ListGroup, Modal, Row, Spinner } from 'react-bootstrap';
import apiClient from '../../api/client';
import { useTranslation } from 'react-i18next';

// -------------------- TYPES --------------------
interface PatientType {
  type: string;
  frequency: string;
  include_option: boolean;
  diagnosis: string;
}

interface InterventionItem {
  _id: string;
  title: string;
  description: string;
  media_url: string;
  link: string;
  patient_types: PatientType[];
}

interface AddInterventionModalProps {
  show: boolean;
  onHide: () => void;
  onAdd: (recommendationId: string) => void;
  patient: string;
  existingInterventions: string[];
  patientFunction: string;
}

// -------------------- UTIL FUNCTIONS --------------------
const getBadgeVariantFromUrl = (mediaUrl: string, link: string): string => {
  if (!mediaUrl) {
    if (link.includes('youtube.com') || link.includes('youtu.be')) return 'primary';
    if (link.includes('vimeo.com')) return 'primary';
    return 'warning';
  }

  if (mediaUrl.endsWith('.mp4')) return 'primary';
  if (mediaUrl.endsWith('.mp3')) return 'info';
  if (mediaUrl.endsWith('.pdf')) return 'danger';
  if (/\.(jpg|jpeg|png)$/i.test(mediaUrl)) return 'success';
  return 'secondary';
};

const getMediaTypeLabelFromUrl = (
  mediaUrl: string,
  link: string,
  t: (key: string) => string
): string => {
  if (!mediaUrl) {
    if (link.includes('youtube.com') || link.includes('youtu.be')) return 'Video';
    if (link.includes('vimeo.com')) return 'Video';
    return 'Link';
  }

  if (mediaUrl.endsWith('.mp4')) return 'Video';
  if (mediaUrl.endsWith('.mp3')) return t('Audio');
  if (mediaUrl.endsWith('.pdf')) return 'PDF';
  if (/\.(jpg|jpeg|png)$/i.test(mediaUrl)) return t('Image');
  return 'Unknown';
};

// -------------------- FIXED UTILITY FUNCTION --------------------
const getPatientTypeInfo = (patientTypes: PatientType[], patientFunction: string) =>
  patientTypes.find((pt) => pt.type === patientFunction);

// -------------------- COMPONENT --------------------
const AddInterventionModal: React.FC<AddInterventionModalProps> = ({
  show,
  onHide,
  onAdd,
  patient,
  existingInterventions,
  patientFunction,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<InterventionItem[]>([]);
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [recommendationTypeFilter, setRecommendationTypeFilter] = useState('');

  const fetchInterventions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ recommendations: InterventionItem[] }>(
        `interventions/suggestions/${patient}`
      );
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    if (show) fetchInterventions();
  }, [show, fetchInterventions]);

  const filteredInterventions = recommendations.filter((rec) => {
    const mediaType = getMediaTypeLabelFromUrl(rec.media_url, rec.link, t);
    const matchesContentType = !contentTypeFilter || mediaType === contentTypeFilter;

    const matchesRecommendationType =
      !recommendationTypeFilter ||
      rec.patient_types.some(
        (pt) => pt.include_option === (recommendationTypeFilter === t('Core'))
      );

    return matchesContentType && matchesRecommendationType;
  });

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t('Add Intervention')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" role="status" aria-label="Loading recommendations" />
          </div>
        ) : (
          <>
            <Row className="mb-3">
              <Col>
                <Form.Group controlId="contentTypeFilter">
                  <Form.Label>{t('Filter by Content Type')}</Form.Label>
                  <Form.Select
                    value={contentTypeFilter}
                    onChange={(e) => setContentTypeFilter(e.target.value)}
                  >
                    <option value="">{t('All')}</option>
                    <option value="Video">{t('Video')}</option>
                    <option value="Audio">{t('Audio')}</option>
                    <option value="PDF">{t('PDF')}</option>
                    <option value="Image">{t('Image')}</option>
                    <option value="Link">{t('Link')}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group controlId="recommendationTypeFilter">
                  <Form.Label>{t('Filter by Core/Supportive')}</Form.Label>
                  <Form.Select
                    value={recommendationTypeFilter}
                    onChange={(e) => setRecommendationTypeFilter(e.target.value)}
                  >
                    <option value="">{t('All')}</option>
                    <option value="Core">{t('Core')}</option>
                    <option value="Supportive">{t('Supportive')}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <ListGroup>
              {filteredInterventions.length === 0 ? (
                <ListGroup.Item className="text-center text-muted">
                  {t('No interventions available')}
                </ListGroup.Item>
              ) : (
                filteredInterventions.map((rec) => {
                  const alreadyAdded = existingInterventions.includes(rec._id);
                  const patientTypeInfo = getPatientTypeInfo(rec.patient_types, patientFunction);

                  return (
                    <ListGroup.Item
                      key={rec._id}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <h5>
                          {rec.title}{' '}
                          <Badge bg={getBadgeVariantFromUrl(rec.media_url, rec.link)}>
                            {getMediaTypeLabelFromUrl(rec.media_url, rec.link, t)}
                          </Badge>
                        </h5>
                        <p>{rec.description}</p>
                        <p>
                          <strong>{t('Frequency:')}</strong>{' '}
                          {patientTypeInfo?.frequency || t('None')}
                        </p>
                        <p>
                          <strong>{t('Type:')}</strong>{' '}
                          {patientTypeInfo?.include_option ? t('Core') : t('Supportive')}
                        </p>
                      </div>
                      {!alreadyAdded ? (
                        <Button
                          variant="success"
                          onClick={() => onAdd(rec._id)}
                          aria-label={`Add ${rec.title}`}
                        >
                          {t('Add')}
                        </Button>
                      ) : (
                        <span className="text-muted">{t('Already Added')}</span>
                      )}
                    </ListGroup.Item>
                  );
                })
              )}
            </ListGroup>
          </>
        )}
      </Modal.Body>
      <Modal.Footer />
    </Modal>
  );
};

export default AddInterventionModal;
export { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl };
