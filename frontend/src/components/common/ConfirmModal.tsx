import React from 'react';
import StandardModal from './StandardModal';
import { Button } from '@/components/ui/button';

type Props = {
  show: boolean;
  onHide: () => void;
  title: React.ReactNode;
  body: React.ReactNode;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
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
          <Button size="dashboard" variant="secondary" onClick={onHide}>
            {cancelText}
          </Button>
          <Button
            size="dashboard"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className="bg-nok hover:bg-nok/90"
          >
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
