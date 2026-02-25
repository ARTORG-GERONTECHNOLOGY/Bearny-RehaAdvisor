import Layout from '@/components/Layout';
import { useTranslation } from 'react-i18next';
import GearFill from '@/assets/icons/gear-fill.svg?react';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="container mx-auto max-w-[90%] md:max-w-screen-md">
        <h1 className="pt-16 md:pt-0 font-bold text-xl flex items-center gap-[6px]">
          <GearFill className="w-6 h-6" />
          {t('Einstellungen')}
        </h1>
      </div>
    </Layout>
  );
}
