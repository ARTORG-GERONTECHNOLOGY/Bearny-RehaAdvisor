import React from 'react';
import { Button } from 'react-bootstrap';
import StandardModal from './StandardModal';

type Props = {
  show: boolean;
  onHide: () => void;
  title: React.ReactNode;
  body: React.ReactNode;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  confirmVariant?: string;
  isConfirmDisabled?: boolean;
};

const ConfirmModal: React.FC<Props> = ({
  show,
  onHide,
  title,
  body,
  confirmText,
  cancelText,
  onConfirm,
  confirmVariant = 'danger',
  isConfirmDisabled = false,
}) => {
  return (
    <StandardModal
      show={show}
      onHide={onHide}
      title={title}
      size="sm"
      backdrop="static"
      keyboard={false}
      footer={
        <>
          <Button variant="secondary" onClick={onHide}>
            {cancelText}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isConfirmDisabled}>
            {confirmText}
          </Button>
        </>
      }
    >
      {body}
    </StandardModal>
  );
};

export default ConfirmModal;
