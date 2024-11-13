import React, { useEffect, useState } from 'react';
import { Badge, Button, Col, Form, ListGroup, Modal, Row, Spinner } from 'react-bootstrap';
import apiClient from '../api/client';

interface AddRecommendationModalProps {
  show: boolean;
  onHide: () => void;
  onAdd: (recommendationId: number) => void;
  patientFunction: string;
  existingRecommendations: number[]; // IDs of recommendations that the patient already has
}

const AddRecommendationModal: React.FC<AddRecommendationModalProps> = ({
                                                                         show,
                                                                         onHide,
                                                                         onAdd,
                                                                         patientFunction,
                                                                         existingRecommendations,
                                                                       }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<any[]>([]);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');
  const [recommendationTypeFilter, setRecommendationTypeFilter] = useState<string>('');
  let patientTypeInfo = {};

  useEffect(() => {
    if (show) {
      fetchRecommendations();
    }
  }, [show]);

  useEffect(() => {
    applyFilters();
  }, [contentTypeFilter, recommendationTypeFilter, recommendations]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`recommendations?function=${patientFunction}`);
      setRecommendations(response.data);
      setFilteredRecommendations(response.data);
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
          (pt: any) => pt.type === patientFunction && pt.include_option === (recommendationTypeFilter === 'Core'),
        ),
      );
    }

    setFilteredRecommendations(filtered);
  };

  const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      if (link) return 'warning'; // Link
      return 'No Media';
    }

    if (mediaUrl.endsWith('.mp4')) return 'primary'; // Video
    if (mediaUrl.endsWith('.mp3')) return 'info'; // Audio
    if (mediaUrl.endsWith('.pdf')) return 'danger'; // PDF
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'success'; // Image

    return 'secondary'; // Default for unknown file types
  };

  const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      if (link) return 'Link';
      return 'No Media';
    }

    if (mediaUrl.endsWith('.mp4')) return 'Video';
    if (mediaUrl.endsWith('.mp3')) return 'Audio';
    if (mediaUrl.endsWith('.pdf')) return 'PDF';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'Image';

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
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Add Recommendation</Modal.Title>
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
                  <Form.Label>Filter by Content Type</Form.Label>
                  <Form.Select value={contentTypeFilter} onChange={(e) => setContentTypeFilter(e.target.value)}>
                    <option value="">All</option>
                    <option value="Video">Video</option>
                    <option value="Audio">Audio</option>
                    <option value="PDF">PDF</option>
                    <option value="Image">Image</option>
                    <option value="Link">Link</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group controlId="recommendationTypeFilter">
                  <Form.Label>Filter by Core/Supportive</Form.Label>
                  <Form.Select value={recommendationTypeFilter}
                               onChange={(e) => setRecommendationTypeFilter(e.target.value)}>
                    <option value="">All</option>
                    <option value="Core">Core</option>
                    <option value="Supportive">Supportive</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Recommendations List */}
            <ListGroup>
              {filteredRecommendations.map((rec) => {
                const alreadyAdded = existingRecommendations.includes(rec._id);

                return (
                  <ListGroup.Item key={rec._id} className="d-flex justify-content-between align-items-center">
                    <div>
                      <h5>
                        {rec.title}{' '}
                        <Badge bg={getBadgeVariantFromUrl(rec.media_url, rec.link)}>
                          {getMediaTypeLabelFromUrl(rec.media_url, rec.link)}
                        </Badge>
                      </h5>
                      <p>{rec.description}</p>
                      <p>
                        <strong>Frequency:</strong> {getFreq(rec.patient_types) || 'N/A'}
                      </p>
                      <p>
                        <strong>Type:</strong> {getType(rec.patient_types) ? 'Core' : 'Supportive'}
                      </p>
                    </div>
                    {!alreadyAdded && (
                      <Button variant="success" onClick={() => onAdd(rec._id)}>
                        Add
                      </Button>
                    )}
                    {alreadyAdded && <span className="text-muted">Already Added</span>}
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

export default AddRecommendationModal;
