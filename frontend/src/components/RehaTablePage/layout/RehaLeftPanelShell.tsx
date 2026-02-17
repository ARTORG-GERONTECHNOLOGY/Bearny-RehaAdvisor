import React from 'react';
import { Card } from 'react-bootstrap';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const RehaLeftPanelShell: React.FC<Props> = ({ children, className }) => {
  return (
    <Card className={`rehaPanel rehaPanel--left ${className || ''}`}>
      <Card.Body className="rehaPanel__body rehaPanel__body--flush">{children}</Card.Body>
    </Card>
  );
};

export default RehaLeftPanelShell;
