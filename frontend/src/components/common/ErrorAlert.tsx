import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
  className?: string;
}

const ErrorAlert: FC<ErrorAlertProps> = ({ message, onClose, className = '' }) => {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <Alert variant="destructive" onClose={onClose} closeLabel={t('Close alert')}>
        {message}
      </Alert>
    </div>
  );
};

export default ErrorAlert;
