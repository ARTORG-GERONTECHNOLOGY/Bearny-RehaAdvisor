import React from 'react';
import { Row, Col, Nav } from 'react-bootstrap';

type MainTab = 'library' | 'templates';

type Props = {
  mainTab: MainTab;
  onChange: (tab: MainTab) => void;
};

const MainTabs: React.FC<Props> = ({ mainTab, onChange }) => {
  return (
    <Row className="mb-3">
      <Col>
        <Nav
          variant="tabs"
          activeKey={mainTab}
          onSelect={(k) => onChange((k as MainTab) || 'library')}
        >
          <Nav.Item>
            <Nav.Link eventKey="library">Interventions</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="templates">Your Templates</Nav.Link>
          </Nav.Item>
        </Nav>
      </Col>
    </Row>
  );
};

export default MainTabs;
