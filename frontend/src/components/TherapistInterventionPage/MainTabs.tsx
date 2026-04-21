import React from 'react';
import { Row, Col, Nav } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

type MainTab = 'library' | 'templates';

type Props = {
  mainTab: MainTab;
  onChange: (tab: MainTab) => void;
};

const MainTabs: React.FC<Props> = ({ mainTab, onChange }) => {
  const { t } = useTranslation();
  return (
    <Row className="mb-3">
      <Col>
        <Nav
          variant="tabs"
          role="tablist"
          activeKey={mainTab}
          onSelect={(k) => onChange((k as MainTab) || 'library')}
        >
          <Nav.Item>
            <Nav.Link eventKey="library">{t('Interventions')}</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="templates">{t('Your Templates')}</Nav.Link>
          </Nav.Item>
        </Nav>
      </Col>
    </Row>
  );
};

export default MainTabs;
