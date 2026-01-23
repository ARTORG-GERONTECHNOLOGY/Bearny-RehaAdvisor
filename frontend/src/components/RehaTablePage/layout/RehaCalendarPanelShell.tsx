import React from 'react';
import { Card } from 'react-bootstrap';

type Props = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

const RehaCalendarPanelShell: React.FC<Props> = ({ title, children, className }) => {
  return (
    <Card className={`rehaPanel rehaPanel--calendar ${className || ''}`}>
      <Card.Header className="rehaPanel__header">
        <div className="rehaPanel__headerRow">
          <div className="rehaPanel__title">{title}</div>
        </div>
      </Card.Header>

      <Card.Body className="rehaPanel__body rehaPanel__body--calendar">
        {children}
      </Card.Body>
    </Card>
  );
};

export default RehaCalendarPanelShell;
