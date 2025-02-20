import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row } from 'react-bootstrap';
import apiClient from '../api/client';
import config from '../config/config.json';
import authStore from '../stores/authStore';

interface ProductPopupProps {
  show: boolean;
  item: any;
  handleClose: () => void;
  therapist: string;
}

const ProductPopup: React.FC<ProductPopupProps> = ({ show, item, handleClose, therapist }) => {
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
      <Modal.Header closeButton>
        <Modal.Title>{item.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row>
          <Col>
            <h5>Description</h5>
            <p>{item.description}</p>
          </Col>
        </Row>

        <Row>
          <Col md={6}>
            <h6>Content Type</h6>
            <p>{item.content_type}</p>
          </Col>
          <Col md={6}>
            <h6>Source</h6>
            
            <ListGroup variant="flush">
              {item.link && (
                <ListGroup.Item>
                  {/* <a href={item.link} target="_blank" rel="noopener noreferrer">View Article</a>*/}
                  <iframe src={item.link} title='Link to a recomendation'></iframe>
                </ListGroup.Item>
              )}
              {item.media_url && (
                <>
                  {item.media_url.endsWith('.mp4') && (
                    <ListGroup.Item>
                      <video width="100%" controls>
                        <source src={item.media_url} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </ListGroup.Item>
                  )}
                  {item.media_url.endsWith('.mp3') && (
                    <ListGroup.Item>
                      <audio controls>
                        <source src={item.media_url} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                    </ListGroup.Item>
                  )}
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
