import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

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
      <Modal show={show} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {imageUrl && <img src={imageUrl} alt={title} style={{ width: '100%', marginBottom: '1rem' }} />}
          <p>{content}</p>
        </Modal.Body>
        <Modal.Footer>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default ArticlePopup;
