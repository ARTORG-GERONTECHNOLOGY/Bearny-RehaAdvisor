import { FC } from 'react';
import { Alert } from 'react-bootstrap';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
  className?: string; // optional wrapper class
}

const ErrorAlert: FC<ErrorAlertProps> = ({ message, onClose, className = '' }) => {
  return (
    <div className={`px-2 ${className}`}>
      <Alert variant="danger" dismissible onClose={onClose} role="alert">
        {message}
      </Alert>
    </div>
  );
};

export default ErrorAlert;
