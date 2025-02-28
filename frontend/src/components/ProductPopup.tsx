import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row, Badge } from 'react-bootstrap';
import apiClient from '../api/client';
import config from '../config/config.json';
import authStore from '../stores/authStore';

interface ProductPopupProps {
  show: boolean;
  item: any;
  handleClose: () => void;
  therapist: string;
  tagColors: any;
}

const ProductPopup: React.FC<ProductPopupProps> = ({ show, item, handleClose, therapist, tagColors }) => {
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [selectedAll, setSelectedAll] = useState<boolean>(false);
  // @ts-ignore
  const diagnoses = config?.patientInfo?.function?.[authStore?.specialisation]?.diagnosis || [];

  useEffect(() => {
    if (show) {
      fetchAssignedDiagnoses();
    }
  }, [show]);

  const fetchAssignedDiagnoses = async () => {
    try {
      const response = await apiClient.get(
        `recommendations/${item['_id']}/assigned-diagnoses/${authStore.specialisation}/therapist/${authStore.id}`,
      );
      const assignedDiagnoses = Object.entries(response.data.diagnoses)
        .filter(([_, isAssigned]) => isAssigned)
        .map(([diagnosis]) => diagnosis);

      setSelectedDiagnoses(assignedDiagnoses);
      setSelectedAll(response.data.all);
    } catch (error) {
      console.error('Error fetching assigned diagnoses:', error);
    }
  };

  const handleCheckboxChange = async (diagnosis: string) => {
    const isChecked = selectedDiagnoses.includes(diagnosis);
    setSelectedDiagnoses((prevSelected) =>
      isChecked ? prevSelected.filter((d) => d !== diagnosis) : [...prevSelected, diagnosis],
    );

    try {
      const endpoint = isChecked ? 'recommendations/remove-from-patient-types/' : 'recommendations/assign-to-patient-types/';
      await apiClient.post(endpoint, {
        diagnosis,
        intervention_id: item['_id'],
        therapist: authStore.id,
      });
    } catch (error) {
      console.error(`Error updating intervention for ${diagnosis}:`, error);
    }
  };

  const handleAllCheckboxChange = async () => {
    const newSelectedAll = !selectedAll;
    setSelectedAll(newSelectedAll);
    setSelectedDiagnoses(newSelectedAll ? diagnoses : []);

    try {
      await apiClient.post(newSelectedAll ? 'recommendations/assign-to-patient-types/' : 'recommendations/remove-from-patient-types/', {
        diagnosis: 'all',
        intervention_id: item['_id'],
        therapist: authStore.id,
      });
    } catch (error) {
      console.error('Error updating "all" checkbox:', error);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton className="d-flex justify-content-between align-items-center">
      <Modal.Title>
      <h2>{item.title}</h2>
      <h3 className="text-muted">{item.content_type}</h3>

      {/* Beneft for Section - Directly Below Content Type */}
      {item.benefitFor?.length > 0 && (<>
        
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.benefitFor.map((benefit) => (
                <Badge
                  key={benefit}
                  style={{ color: 'white' }}
                  className="me-1"
                >
                  {benefit}
                </Badge>
              ))}
            </div>
            </>
          )}

      {/* Tags Section - Directly Below Content Type */}
      {item.tags?.length > 0 && (
        <div className="mt-2 d-flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              bg=""
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

  {/* Description Section with Spacing & Shadow Separator */}
  <Row className="pb-3 mb-3 border-bottom">
    <Col>
      <h5>Description</h5>
      <p className="text-muted">{item.description}</p>
    </Col>
  </Row>

  {/* Content Type and Source Side-by-Side */}
  <Row className="pb-3 mb-3">
    <Col md={6}>
      <h5>Source</h5>
      <ListGroup variant="flush">
        {/* Link Source */}
        {item.link && (
          <ListGroup.Item>
            <iframe
              src={item.link}
              title="Link to a recommendation"
              style={{ width: '100%', height: '250px', border: 'none', borderRadius: '5px' }}
            ></iframe>
          </ListGroup.Item>
        )}

        {/* Media Sources */}
        {item.media_url && (
          <>
            {/* Video */}
            {item.media_url.endsWith('.mp4') && (
              <ListGroup.Item>
                <video width="100%" controls className="rounded shadow-sm">
                  <source src={item.media_url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </ListGroup.Item>
            )}
            {/* Audio */}
            {item.media_url.endsWith('.mp3') && (
              <ListGroup.Item>
                <audio controls className="w-100">
                  <source src={item.media_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </ListGroup.Item>
            )}
            {/* PDF */}
            {item.media_url.endsWith('.pdf') && (
              <ListGroup.Item>
                <a href={item.media_url} target="_blank" rel="noopener noreferrer">
                  View PDF
                </a>
              </ListGroup.Item>
            )}
          </>
        )}
      </ListGroup>
    </Col>
  </Row>

        <hr />
        <h5>{t('Assign to Patient Types')}</h5>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <ListGroup>
            <ListGroup.Item>
              <label>
                <input
                  type="checkbox"
                  checked={selectedAll}
                  onChange={handleAllCheckboxChange}
                  className="me-2"
                />
                All
              </label>
            </ListGroup.Item>
            {!selectedAll &&
              diagnoses.map((diagnosis: string) => (
                <ListGroup.Item key={diagnosis}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedDiagnoses.includes(diagnosis)}
                      onChange={() => handleCheckboxChange(diagnosis)}
                      className="me-2"
                    />
                    {diagnosis}
                  </label>
                </ListGroup.Item>
              ))}
          </ListGroup>
        </div>
      </Modal.Body>
      <Modal.Footer />
    </Modal>
  );
};

export default ProductPopup;
