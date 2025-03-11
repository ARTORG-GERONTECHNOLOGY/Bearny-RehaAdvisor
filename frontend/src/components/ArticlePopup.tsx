import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { t } from 'i18next';
// @ts-ignore
const ArticlePopup = ({ title, content, imageUrl }) => {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      {/* Button to trigger the popup */}
      <Button variant="primary" onClick={handleShow}>
        Read Article
      </Button>

      {/* Modal with article information */}
      <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title>{t(title)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {imageUrl && <img src={imageUrl} alt={title} style={{ width: '100%', marginBottom: '1rem' }} />}
          <p>{t(content)}</p>
        </Modal.Body>
        <Modal.Footer>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default ArticlePopup;
