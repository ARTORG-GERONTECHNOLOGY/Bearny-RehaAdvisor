import React from 'react';
import { Modal } from 'react-bootstrap';

type Props = {
  show: boolean;
  onHide: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  centered?: boolean;
  backdrop?: true | 'static';
  keyboard?: boolean;
  className?: string;
};

const StandardModal: React.FC<Props> = ({
  show,
  onHide,
  title,
  children,
  footer,
  size = 'lg',
  centered = true,
  backdrop = 'static',
  keyboard = false,
  className,
}) => {
  return (
    <Modal
      show={show}
      onHide={onHide}
      centered={centered}
      size={size}
      backdrop={backdrop}
      keyboard={keyboard}
      dialogClassName={`rs-modal ${className || ''}`.trim()}
    >
      {title !== undefined && (
        <Modal.Header closeButton>
          <Modal.Title className="rs-modal__title">{title}</Modal.Title>
        </Modal.Header>
      )}

      <Modal.Body className="rs-modal__body">{children}</Modal.Body>

      {footer !== undefined && <Modal.Footer className="rs-modal__footer">{footer}</Modal.Footer>}
    </Modal>
  );
};

export default StandardModal;
