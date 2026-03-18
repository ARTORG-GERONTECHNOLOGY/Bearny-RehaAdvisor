import { useState } from 'react';
import Layout from '@/components/Layout';
import { useTranslation } from 'react-i18next';
import GearFill from '@/assets/icons/gear-fill.svg?react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import HelpCenter from '@/components/help/HelpCenter';
import { useNotifications } from '@/hooks/useNotifications';
import authStore from '@/stores/authStore';
import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';
import { Dropdown } from 'react-bootstrap';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { enabled, permission, supportsPeriodicSync, toggleNotifications } = useNotifications();

  const isLoggedIn = authStore.isAuthenticated;
  const getInitialLang = () =>
    localStorage.getItem('i18nextLng')?.slice(0, 2) || i18n.language?.slice(0, 2) || 'en';

  const [currentLanguage, setCurrentLanguage] = useState(getInitialLang);
  const [helpOpen, setHelpOpen] = useState(false);

  const languages = ['de', 'fr', 'en', 'it', 'pt', 'nl'] as const;

  const flagMap: Record<string, string> = {
    en: flagEn,
    de: flagDe,
    fr: flagFr,
    it: flagIt,
    pt: flagPt,
    nl: flagNl,
  };

  const lang = currentLanguage.slice(0, 2);

  const handleLanguageChange = (l: string) => {
    i18n.changeLanguage(l);
    setCurrentLanguage(l);
  };

  const handleLogout = async () => {
    await authStore.logout();
    window.location.href = '/';
  };

  return (
    <>
      <Layout>
        <h1 className="font-bold text-xl flex items-center gap-[6px]">
          <GearFill className="w-6 h-6" />
          {t('Settings')}
        </h1>

        <div className="mt-4 flex flex-col gap-2">
          <div className="bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-base font-medium">{t('Notifications')}</div>
                <div className="text-[#565656] text-sm">{t('Receive daily reminders')}</div>
                {permission === 'denied' && (
                  <div className="text-red-600 text-xs mt-1">
                    {t('Notification permission denied. Please enable in browser settings.')}
                  </div>
                )}
                {!supportsPeriodicSync && (
                  <div className="text-amber-600 text-xs mt-1">
                    {t('Background notifications not supported in this browser.')}
                  </div>
                )}
              </div>
              <Switch checked={enabled} onCheckedChange={toggleNotifications} />
            </div>
          </div>

          <div className="bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5">
            <div className="text-base font-medium">{t('Language')}</div>
            <Dropdown>
              <Dropdown.Toggle variant="light">
                <img src={flagMap[lang]} className="h-4 w-4 rounded-full mr-2" />
                {lang.toUpperCase()}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {languages.map((l) => (
                  <Dropdown.Item key={l} onClick={() => handleLanguageChange(l)}>
                    <img src={flagMap[l]} className="h-4 w-4 rounded-full mr-2" />
                    {l.toUpperCase()}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>

          <div className="bg-[#F9F9F9] border border-[#D4D4D4] rounded-[16px] p-5">
            <div className="text-base font-medium">{t('Help')}</div>
            <Button onClick={() => setHelpOpen(true)} className="mt-2">
              {t('Help')}
            </Button>
          </div>

          {isLoggedIn && (
            <Button
              onClick={() => {
                handleLogout();
              }}
              className="w-full"
            >
              {t('Logout')}
            </Button>
          )}
        </div>
      </Layout>

      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
