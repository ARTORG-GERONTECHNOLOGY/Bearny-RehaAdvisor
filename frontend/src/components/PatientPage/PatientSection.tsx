import React from 'react';
import { Row, Col } from 'react-bootstrap';

type Props = {
  children: React.ReactNode;
};

const PatientSection: React.FC<Props> = ({ children }) => (
  <Row className="patient-section justify-content-center">
    <Col xs={12} sm={11} md={10} lg={8}>
      {children}
    </Col>
  </Row>
);

export default PatientSection;
