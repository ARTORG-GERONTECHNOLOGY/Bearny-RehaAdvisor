import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, ListGroup, Row, Col } from 'react-bootstrap';
import apiClient from '../api/client';

interface ProductPopupProps {
  show: boolean;
  item: any;
  handleClose: () => void;
  therapist: string;
}

const ProductPopup: React.FC<ProductPopupProps> = ({ show, item, handleClose, therapist }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatients, setSelectedPatients] = useState(new Set<string>());

  useEffect(() => {
    if (show) {
      fetchPatients();
    }
  }, [show]);

  const fetchPatients = async () => {
    try {
      const response = await apiClient.get(`therapist/${therapist}/patientsbyinter/${item['_id']}`);
      setPatients(response.data);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const handleCheckboxChange = async (patientId: string, uses: boolean) => {
    const updatedSelectedPatients = new Set(selectedPatients);

    try {
      if (uses) {
        await apiClient.post('rminterforpatient', { patient_id: patientId, intervention_id: item['_id'] });
        updatedSelectedPatients.delete(patientId);
      } else {
        await apiClient.post('addinterforpatient', { patient_id: patientId, intervention_id: item['_id'] });
        updatedSelectedPatients.add(patientId);
      }
      setSelectedPatients(updatedSelectedPatients);
      fetchPatients();
    } catch (error) {
      console.error('Error updating recommendation:', error);
    }
  };

  // @ts-ignore
  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{item.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Recommendation Details */}
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
              {/* Link for article */}
              {item.link && (
                <ListGroup.Item>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">View Article</a>
                </ListGroup.Item>
              )}

              {/* Video content */}
              {item.media_url && item.media_url.endsWith(".mp4") && (
                <ListGroup.Item>
                  <video width="100%" controls>
                    <source src={item.media_url} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </ListGroup.Item>
              )}

              {/* Audio content */}
              {item.media_url && item.media_url.endsWith(".mp3") && (
                <ListGroup.Item>
                  <audio controls>
                    <source src={item.media_url} type="audio/mp3" />
                    Your browser does not support the audio element.
                  </audio>
                </ListGroup.Item>
              )}

              {/* PDF content */}
              {item.media_url && item.media_url.endsWith(".pdf") && (
                <ListGroup.Item>
                  <a href={item.media_url} target="_blank" rel="noopener noreferrer">View PDF</a>
                </ListGroup.Item>
              )}

              {/* Image content */}
              {item.media_url && (item.media_url.endsWith(".jpg") || item.media_url.endsWith(".jpeg") || item.media_url.endsWith(".png")) && (
                <ListGroup.Item>
                  <img src={item.media_url} alt="Image content" width="100%" />
                </ListGroup.Item>
              )}

              {/* Message for unavailable media */}
              {!item.link && !item.media_url && <p>No links or media available</p>}
            </ListGroup>

          </Col>
        </Row>

        {/* Patient Types */}
        <hr />
        <h5>Patient Types</h5>
        <div>
          {item.patient_types.map((pt: any, idx: any) => (
            <ListGroup key={idx} className="mb-3">
              <ListGroup.Item variant="light">
                <Row>
                  <Col md={4}>
                    <strong>Type:</strong>
                    <p className="mb-1">{pt.type}</p>
                  </Col>
                  <Col md={4}>
                    <strong>Frequency:</strong>
                    <p className="mb-1">{pt.frequency}</p>
                  </Col>
                  <Col md={4}>
                    <strong>Core/Support:</strong>
                    <p className="mb-1">{pt.include_option ? 'Core' : 'Supportive'}</p>
                  </Col>
                </Row>
              </ListGroup.Item>
            </ListGroup>
          ))}
        </div>

        {/* Select Patients to Recommend */}
        <hr />
        <h5>Assign to Patients</h5>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {patients.map((patient) => (
            <Form.Check
              key={patient.username}
              type="checkbox"
              label={patient.name}
              checked={patient.uses_intervention}
              onChange={() => handleCheckboxChange(patient.username, patient.uses_intervention)}
            />
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ProductPopup;
