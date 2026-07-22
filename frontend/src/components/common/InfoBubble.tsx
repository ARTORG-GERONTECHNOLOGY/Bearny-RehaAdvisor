import React from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

interface InfoBubbleProps {
  tooltip: string;
  id?: string; // Optional unique ID for accessibility
}

const InfoBubble: React.FC<InfoBubbleProps> = ({ tooltip, id = 'info-tooltip' }) => {
  const { t } = useTranslation();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="info-bubble-icon"
            role="button"
            aria-label={t('More information')}
            tabIndex={0}
          >
            <Info size={18} data-testid="lucide-icon" />
          </span>
        </TooltipTrigger>
        <TooltipContent id={id}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoBubble;
