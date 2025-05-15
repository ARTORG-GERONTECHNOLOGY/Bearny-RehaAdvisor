// components/common/ErrorAlert.tsx
import { FC } from 'react';
import { Alert } from 'react-bootstrap';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
}

const ErrorAlert: FC<ErrorAlertProps> = ({ message, onClose }) => {
  return (
    <Alert variant="danger" dismissible onClose={onClose}>
      {message}
    </Alert>
  );
};

export default ErrorAlert;
