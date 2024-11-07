import React from 'react';
import { Modal, Button } from 'react-bootstrap';

// @ts-ignore
const DeleteConfirmation = ({ show, handleClose, handleConfirm }) => {
  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Delete Account</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Are you sure you want to delete your account? This action cannot be undone.</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm}>
          Delete Account
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteConfirmation;
