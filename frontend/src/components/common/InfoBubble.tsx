import React from "react";
import { Tooltip, OverlayTrigger } from "react-bootstrap";
import { Info } from "lucide-react";

interface InfoBubbleProps {
  tooltip: string;
}

const InfoBubble: React.FC<InfoBubbleProps> = ({ tooltip }) => {
  return (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip id="info-tooltip">{tooltip}</Tooltip>}
    >
      <span className="info-icon">
        <Info size={18} />
      </span>
    </OverlayTrigger>
  );
};

export default InfoBubble;
