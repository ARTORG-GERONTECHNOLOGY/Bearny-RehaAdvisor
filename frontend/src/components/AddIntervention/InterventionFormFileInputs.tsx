import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import InfoBubble from '../common/InfoBubble';

const MAX_FILE_BYTES = 1024 * 1024 * 1024; // 1 GB

interface InterventionFormFileInputsProps {
  show: boolean;
  onFileChange: (file: File | null) => void;
}

const InterventionFormFileInputs: React.FC<InterventionFormFileInputsProps> = ({
  show,
  onFileChange,
}) => {
  const { t } = useTranslation();
  const [sizeError, setSizeError] = useState<string | null>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_FILE_BYTES) {
      setSizeError(t('File is too large (max 1GB).'));
      e.target.value = '';
      onFileChange(null);
      return;
    }
    setSizeError(null);
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
        isInvalid={!!sizeError}
      />
      <Form.Text className="text-muted">{t('SupportedFormats')}: JPG, PNG, MP4, MP3, PDF</Form.Text>
      {sizeError && <div className="text-danger small mt-1">{sizeError}</div>}
    </Form.Group>
  );
};

export default InterventionFormFileInputs;
