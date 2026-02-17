import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
    if (link.includes('youtube.com') || link.includes('youtu.be')) return t('Video');
    if (link.includes('vimeo.com')) return t('Video');
    return t('Link');
  }

  if (mediaUrl.endsWith('.mp4')) return t('Video');
  if (mediaUrl.endsWith('.mp3')) return t('Audio');
  if (mediaUrl.endsWith('.pdf')) return t('PDF');
  if (/\.(jpg|jpeg|png)$/i.test(mediaUrl)) return t('Image');
  return t('Unknown');
};

// -------------------- FIXED UTILITY FUNCTION --------------------
const getPatientTypeInfo = (patientTypes: PatientType[], patientFunction: string) =>
  patientTypes.find((pt) => pt.type === patientFunction);

// “dirty” check for confirm-on-close
const isDirty = (contentTypeFilter: string, recommendationTypeFilter: string) =>
  !!contentTypeFilter || !!recommendationTypeFilter;

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
      setRecommendations(Array.isArray(data?.recommendations) ? data.recommendations : []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    if (show) fetchInterventions();
  }, [show, fetchInterventions]);

  // Reset filters when the modal is closed externally
  useEffect(() => {
    if (!show) {
      setContentTypeFilter('');
      setRecommendationTypeFilter('');
      setRecommendations([]);
      setLoading(true);
    }
  }, [show]);

  const confirmClose = useCallback(() => {
    const dirty = isDirty(contentTypeFilter, recommendationTypeFilter);
    const msg = dirty
      ? t('Are you sure you want to close? Unsaved data will be lost.')
      : t('Close this window?');

    if (dirty && !window.confirm(msg)) return;

    // reset local UI state
    setContentTypeFilter('');
    setRecommendationTypeFilter('');
    onHide();
  }, [contentTypeFilter, recommendationTypeFilter, onHide, t]);

  // Esc should follow the same close logic (even with backdrop="static")
  const onEscapeKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      confirmClose();
    },
    [confirmClose]
  );

  useEffect(() => {
    if (!show) return;
    window.addEventListener('keydown', (e: any) => {
      if (e.key === 'Escape') onEscapeKeyDown(e);
    });
    return () => {
      window.removeEventListener('keydown', (e: any) => {
        if (e.key === 'Escape') onEscapeKeyDown(e);
      });
    };
  }, [show, onEscapeKeyDown]);

  const filteredInterventions = useMemo(() => {
    return recommendations.filter((rec) => {
      const mediaType = getMediaTypeLabelFromUrl(rec.media_url, rec.link, t);
      const matchesContentType = !contentTypeFilter || mediaType === contentTypeFilter;

      // (kept) recommendationTypeFilter is currently not surfaced in UI; still supported.
      const matchesRecommendationType =
        !recommendationTypeFilter ||
        rec.patient_types.some(
          (pt) => pt.include_option === (recommendationTypeFilter === t('Core'))
        );

      return matchesContentType && matchesRecommendationType;
    });
  }, [recommendations, contentTypeFilter, recommendationTypeFilter, t]);

  return (
    <Modal
      show={show}
      onHide={confirmClose} // ✅ X button + Esc path uses confirmClose
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        confirmClose();
      }}
      centered
      size="lg"
      backdrop="static"
      keyboard // ✅ allow Esc to trigger onHide
    >
      <Modal.Header closeButton>
        <Modal.Title>{t('Add Intervention')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" role="status" aria-label={t('Loading recommendations')} />
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
                    aria-label={t('Filter by Content Type')}
                  >
                    <option value="">{t('All')}</option>
                    <option value={t('Video')}>{t('Video')}</option>
                    <option value={t('Audio')}>{t('Audio')}</option>
                    <option value={t('PDF')}>{t('PDF')}</option>
                    <option value={t('Image')}>{t('Image')}</option>
                    <option value={t('Link')}>{t('Link')}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <ListGroup aria-label={t('Interventions list')}>
              {filteredInterventions.length === 0 ? (
                <ListGroup.Item className="text-center text-muted">
                  {t('No interventions available')}
                </ListGroup.Item>
              ) : (
                filteredInterventions.map((rec) => {
                  const alreadyAdded = existingInterventions.includes(rec._id);
                  const patientTypeInfo = getPatientTypeInfo(rec.patient_types, patientFunction);
                  const mediaLabel = getMediaTypeLabelFromUrl(rec.media_url, rec.link, t);

                  return (
                    <ListGroup.Item
                      key={rec._id}
                      className="d-flex justify-content-between align-items-start gap-3"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <h5 className="mb-1">{rec.title}</h5>
                          <Badge
                            bg={getBadgeVariantFromUrl(rec.media_url, rec.link)}
                            title={mediaLabel}
                          >
                            {mediaLabel}
                          </Badge>
                        </div>

                        <p className="mb-2 text-muted">{rec.description}</p>

                        <div className="small">
                          <div>
                            <strong>{t('Frequency:')}</strong>{' '}
                            {patientTypeInfo?.frequency || t('None')}
                          </div>
                          <div>
                            <strong>{t('Type:')}</strong>{' '}
                            {patientTypeInfo
                              ? patientTypeInfo.include_option
                                ? t('Core')
                                : t('Supportive')
                              : t('None')}
                          </div>
                        </div>
                      </div>

                      <div style={{ flex: '0 0 auto' }}>
                        {!alreadyAdded ? (
                          <Button
                            variant="success"
                            onClick={() => onAdd(rec._id)}
                            aria-label={t('Add {{title}}', { title: rec.title })}
                          >
                            {t('Add')}
                          </Button>
                        ) : (
                          <span className="text-muted" aria-label={t('Already Added')}>
                            {t('Already Added')}
                          </span>
                        )}
                      </div>
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
