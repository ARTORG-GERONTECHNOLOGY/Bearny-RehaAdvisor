import { FC } from 'react';
import { Alert } from '@/components/ui/alert';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
  className?: string;
}

const ErrorAlert: FC<ErrorAlertProps> = ({ message, onClose, className = '' }) => {
  return (
    <div className={className}>
      <Alert variant="destructive" onClose={onClose} closeLabel="Close alert">
        {message}
      </Alert>
    </div>
  );
};

export default ErrorAlert;
