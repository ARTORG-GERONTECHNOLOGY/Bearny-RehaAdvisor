import React, { useEffect, useState } from 'react';
import { Badge, Button, Col, Form, ListGroup, Modal, Row, Spinner } from 'react-bootstrap';
import apiClient from '../api/client';
import { t } from 'i18next';
interface AddInterventionModalProps {
  show: boolean;
  onHide: () => void;
  onAdd: (recommendationId: number) => void;
  patient: string;
  existingInterventions: number[]; // IDs of recommendations that the patient already has
  patientFunction: string;
}

const AddInterventionModal: React.FC<AddInterventionModalProps> = ({
                                                                         show,
                                                                         onHide,
                                                                         onAdd,
                                                                         patient,
                                                                         existingInterventions,
                                                                         patientFunction,
                                                                       }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [recommendations, setInterventions] = useState<any[]>([]);
  const [filteredInterventions, setFilteredInterventions] = useState<any[]>([]);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');
  const [recommendationTypeFilter, setInterventionTypeFilter] = useState<string>('');

  useEffect(() => {
    if (show) {
      fetchInterventions();
    }
  }, [show]);

  useEffect(() => {
    applyFilters();
  }, [contentTypeFilter, recommendationTypeFilter, recommendations]);

  const fetchInterventions = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`recommendations/suggestions/${patient}`);
      setInterventions(response.data.recommendations);
      setFilteredInterventions(response.data.recommendations);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    }
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = recommendations;

    if (contentTypeFilter) {
      filtered = filtered.filter(
        (rec) => getMediaTypeLabelFromUrl(rec.media_url, rec.link) === contentTypeFilter,
      );
    }

    if (recommendationTypeFilter) {
      filtered = filtered.filter((rec) =>
        rec.patient_types.some(
          (pt: any) => pt.include_option === (recommendationTypeFilter === t('Core')),
        ),
      );
    }

    setFilteredInterventions(filtered);
  };

  const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      const isDomain = (url: string, domain: string) => url.includes(domain);

      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'primary';
      if (isDomain(link, 'vimeo.com')) return 'primary';

      return 'warning';
    }

    if (mediaUrl.endsWith('.mp4')) return 'primary';
    if (mediaUrl.endsWith('.mp3')) return 'info';
    if (mediaUrl.endsWith('.pdf')) return 'danger';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'success';


    return 'secondary'; // Default for unknown file types
  };

  const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      const isDomain = (url: string, domain: string) => url.includes(domain);

      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'Video';
      if (isDomain(link, 'vimeo.com')) return 'Video';

      return 'Link';
    }

    if (mediaUrl.endsWith('.mp4')) return 'Video';
    if (mediaUrl.endsWith('.mp3')) return t('Audio');
    if (mediaUrl.endsWith('.pdf')) return 'PDF';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return t('Image');

    return 'Unknown';
  };

  const getType = (patienttypes: any) => {
    const patientTypeInfo = patienttypes.find((pt: any) => pt.type === patientFunction[0]);

    if (patientTypeInfo) {
      return patientTypeInfo.include_option || '';
    }
    return '';
  };
  const getFreq = (patienttypes: any) => {
    const patientTypeInfo = patienttypes.find((pt: any) => pt.type === patientFunction[0]);

    if (patientTypeInfo) {
      return patientTypeInfo.frequency || 'None';
    }
    return 'None';
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{t("Add Intervention")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <Spinner animation="border" variant="primary" />
        ) : (
          <>
            {/* Filters */}
            <Row className="mb-3">
              <Col>
                <Form.Group controlId="contentTypeFilter">
                  <Form.Label>{t("Filter by Content Type")}</Form.Label>
                  <Form.Select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
                    <option value="">{t("All")}</option>
                    <option value="Video">{t("Video")}</option>
                    <option value="Audio">{t("Audio")}</option>
                    <option value="PDF">{t("PDF")}</option>
                    <option value="Image">{t("Image")}</option>
                    <option value="Link">{t("Link")}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group controlId="recommendationTypeFilter">
                  <Form.Label>{t("Filter by Core/Supportive")}</Form.Label>
                  <Form.Select value={recommendationTypeFilter}
                               onChange={(e) => setInterventionTypeFilter(e.target.value)}>
                    <option value="">{t("All")}</option>
                    <option value="Core">{t("Core")}</option>
                    <option value="Supportive">{t("Supportive")}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Interventions List */}
            <ListGroup>
              {filteredInterventions.map((rec) => {
                const alreadyAdded = existingInterventions.includes(rec._id);

                return (
                  <ListGroup.Item key={rec._id} className="d-flex justify-content-between align-items-center">
                    <div>
                      <h5>
                        {rec.title}{' '}
                        <Badge bg={getBadgeVariantFromUrl(rec.media_url, rec.link)}>
                          {getMediaTypeLabelFromUrl(rec.media_url, rec.link)}
                        </Badge>
                      </h5>
                      <p>{t(rec.description)}</p>
                      <p>
                        <strong>{t("Frequency:")}</strong> {getFreq(rec.patient_types) || 'N/A'}
                      </p>
                      <p>
                        <strong>{t("Type:")}</strong> {getType(rec.patient_types) ? 'Core' : 'Supportive'}
                      </p>
                    </div>
                    {!alreadyAdded && (
                      <Button variant="success" onClick={() => onAdd(rec._id)}>
                        {t("Add")}
                      </Button>
                    )}
                    {alreadyAdded && <span className="text-muted">{t("Already Added")}</span>}
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
      </Modal.Footer>
    </Modal>
  );
};

export default AddInterventionModal;
