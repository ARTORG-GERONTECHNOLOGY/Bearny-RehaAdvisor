import React from 'react';
import { Modal, Button } from 'react-bootstrap';

// @ts-ignore
const PatientPopup_re = ({ show, item, handleClose }) => {
  if (!item) return null;

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>Patient Details: {item.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p><strong>Age:</strong> {item.age}</p>
        <p><strong>Feedback:</strong> {item.feedback}</p>
        <p><strong>Recommendations:</strong> {item.recommendations.join(', ')}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PatientPopup_re;
