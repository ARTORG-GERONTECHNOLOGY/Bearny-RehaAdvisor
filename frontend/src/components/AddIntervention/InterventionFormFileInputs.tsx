import React from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import InfoBubble from '../common/InfoBubble';

interface InterventionFormFileInputsProps {
  show: boolean;
  onFileChange: (file: File | null) => void;
}

const InterventionFormFileInputs: React.FC<InterventionFormFileInputsProps> = ({
  show,
  onFileChange,
}) => {
  const { t } = useTranslation();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onFileChange(file);
  };

  if (!show) return null;

  return (
    <Form.Group controlId="mediaFile" className="mt-3">
      <Form.Label>
        {t('UploadMediaFile')}{' '}
        <InfoBubble tooltip={t('Use this to upload a related video, audio, image, or PDF file.')} />
      </Form.Label>
      <Form.Control
        type="file"
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={handleFileInputChange}
        aria-label={t('UploadMediaFile')}
      />
      <Form.Text className="text-muted">
        {t('SupportedFormats')}: JPG, PNG, MP4, MP3, PDF
      </Form.Text>
    </Form.Group>
  );
};

export default InterventionFormFileInputs;
