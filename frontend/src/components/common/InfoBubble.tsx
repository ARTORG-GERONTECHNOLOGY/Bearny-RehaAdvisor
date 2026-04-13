import React from 'react';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface InfoBubbleProps {
  tooltip: string;
  id?: string; // Optional unique ID for accessibility
}

const InfoBubble: React.FC<InfoBubbleProps> = ({ tooltip, id = 'info-tooltip' }) => {
  const { t } = useTranslation();
  return (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip id={id}>{tooltip}</Tooltip>}
      delay={{ show: 150, hide: 200 }}
    >
      <span
        className="info-icon cursor-pointer"
        data-testid="info-bubble-icon"
        role="button"
        aria-label={t('More information')}
        aria-describedby={id}
        tabIndex={0}
      >
        <Info size={18} data-testid="lucide-icon" />
      </span>
    </OverlayTrigger>
  );
};

export default InfoBubble;
