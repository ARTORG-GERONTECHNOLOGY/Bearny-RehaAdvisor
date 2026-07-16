import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';

type MainTab = 'library' | 'templates';

type Props = {
  mainTab: MainTab;
  onChange: (tab: MainTab) => void;
};

const MainTabs: React.FC<Props> = ({ mainTab, onChange }) => {
  const { t } = useTranslation();
  return (
    <Tabs
      value={mainTab}
      onValueChange={(value) => onChange((value as MainTab) || 'library')}
      className="mb-3"
    >
      <TabsList>
        <TabsTrigger value="library">{t('Interventions')}</TabsTrigger>
        <TabsTrigger value="templates">{t('Templates')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export default MainTabs;
