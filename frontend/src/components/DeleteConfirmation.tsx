import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { t } from 'i18next';
// @ts-ignore
const DeleteConfirmation = ({ show, handleClose, handleConfirm }) => {
  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Delete Account</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t("Are you sure you want to delete your account? This action cannot be undone.")}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
        {t("Cancel")}
        </Button>
        <Button variant="danger" onClick={handleConfirm}>
          {t("Delete Account")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteConfirmation;
