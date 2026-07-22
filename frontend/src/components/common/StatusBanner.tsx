import React from 'react';
import { Alert } from '@/components/ui/alert';

interface Props {
  type: 'success' | 'destructive';
  message: string;
  onClose: () => void;
}

const StatusBanner: React.FC<Props> = ({ type, message, onClose }) => {
  if (!message) return null;

  return (
    <Alert
      variant={type}
      onClose={onClose}
      className="text-center shadow-sm"
      style={{
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        minWidth: '280px',
      }}
    >
      {message}
    </Alert>
  );
};

export default StatusBanner;
