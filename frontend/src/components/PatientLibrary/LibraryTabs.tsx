// src/pages/patient-library/LibraryTabs.tsx
import React from 'react';
import { Nav } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

export type MainTab = 'library' | 'templates';

type Props = {
  value: MainTab;
  onChange: (v: MainTab) => void;
};

const LibraryTabs: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <Nav
      variant="tabs"
      activeKey={value}
      onSelect={(k) => onChange((k as MainTab) || 'library')}
      className="mb-0"
    >
      <Nav.Item>
        <Nav.Link eventKey="library">{t('Interventions')}</Nav.Link>
      </Nav.Item>

      {/* Templates hidden for patient by default */}
      {/* <Nav.Item><Nav.Link eventKey="templates">{t('Templates')}</Nav.Link></Nav.Item> */}
    </Nav>
  );
};

export default LibraryTabs;
