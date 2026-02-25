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

        <div className="bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5 flex flex-col gap-[2px]">
          <div className="text-[#565656] text-sm">{t('Mitteilungen')}</div>
          <div className="text-base">{t('Ein')}</div>
        </div>
      </div>
    </Layout>
  );
}
