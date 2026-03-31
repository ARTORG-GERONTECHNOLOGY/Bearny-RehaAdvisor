import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Section from '@/components/Section';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import HelpCenter from '@/components/help/HelpCenter';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';
import authStore from '@/stores/authStore';
import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';
import { observer } from 'mobx-react-lite';
import { Link, useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import QuestionFill from '@/assets/icons/question-fill.svg?react';
import LogoutFill from '@/assets/icons/logout-fill.svg?react';
import Mail from '@/assets/icons/contact/mail.svg?react';
import Phone from '@/assets/icons/contact/phone.svg?react';
import config from '@/config/config.json';

const PatientProfile: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { enabled, permission, supportsPeriodicSync, toggleNotifications } = useNotifications();

  const displayName = authStore.firstName || t('Profile');

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

  const languageNames: Record<string, string> = {
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
    pt: 'Português',
    nl: 'Nederlands',
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

  // Check authentication
  useEffect(() => {
    let alive = true;

    const checkAuth = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;
      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
      }
    };

    checkAuth();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <>
      <Layout>
        <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{displayName}</h1>
        <Section className="mt-8">
          <div className="p-2 pl-4 font-medium text-lg text-zinc-500">{t('Settings')}</div>

          <div className="border border-accent p-4 rounded-3xl flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-500">{t('Language')}</div>
            <Select onValueChange={(value) => handleLanguageChange(value)} defaultValue={lang}>
              <SelectTrigger className="bg-white border-white shadow-none p-0">
                <SelectValue placeholder={t('Select language')} />
              </SelectTrigger>
              <SelectContent className="bg-accent rounded-3xl p-1">
                <SelectGroup>
                  {languages.map((l) => (
                    <SelectItem key={l} value={l}>
                      <span className="font-bold text-lg leading-6 text-zinc-800">
                        {languageNames[l]}
                      </span>
                      <img src={flagMap[l]} className="h-4 w-4 rounded-full ml-1 -mt-1" />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="border border-accent p-4 rounded-3xl flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-500">{t('Notifications')}</div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="font-bold text-lg leading-6 text-zinc-800">
                  {t('Receive daily reminders')}
                </div>
                {permission === 'denied' && (
                  <div className="text-red-600 text-xs">
                    {t('Notification permission denied. Please enable in browser settings.')}
                  </div>
                )}
                {!supportsPeriodicSync && (
                  <div className="text-amber-600 text-xs">
                    {t('Background notifications not supported in this browser.')}
                  </div>
                )}
              </div>
              <Switch checked={enabled} onCheckedChange={toggleNotifications} />
            </div>
          </div>
        </Section>

        <Section className="mt-8">
          <div className="flex justify-between w-full">
            <div className="p-2 pl-4 font-medium text-lg text-zinc-500">{t('Contact')}</div>
            <Badge
              onClick={() => setHelpOpen(true)}
              className="font-medium text-zinc-500 rounded-full py-[6px] px-3 border-none bg-zinc-50 shadow-none"
            >
              {t('Help')}
              <QuestionFill className="w-4 h-4 ml-1" />
            </Badge>
          </div>

          <div className="border border-accent p-4 rounded-3xl flex flex-col items-start gap-2">
            <div className="font-bold text-lg leading-6 text-zinc-800">
              {t('Research Project Contact')}
            </div>
            {config.contact.email && (
              <Badge className="pl-[10px] pr-3 py-2 rounded-xl border border-accent bg-white shadow-none">
                <a
                  href={`mailto:${config.contact.email}`}
                  className="flex items-center gap-1 no-underline text-[#00956C]"
                >
                  <Mail className="w-4 h-4" />
                  <span className="font-medium">{config.contact.email}</span>
                </a>
              </Badge>
            )}
            {config.contact.phone && (
              <Badge className="pl-[10px] pr-3 py-2 rounded-xl border border-accent bg-white shadow-none">
                <a
                  href={`tel:${config.contact.phone}`}
                  className="flex items-center gap-1 no-underline text-[#00956C]"
                >
                  <Phone className="w-4 h-4" />
                  <span className="font-medium">{config.contact.phone}</span>
                </a>
              </Badge>
            )}
          </div>
        </Section>

        <div className="flex flex-col items-center gap-6 mt-4 mb-12">
          <img
            src="/artorg_unibern_logo.gif"
            alt="ARTORG Center for Biomedical Engineering Research"
            className="w-[80px]"
          />
          <img
            src="/insel_logo.svg"
            alt="Inselspital - Universitätsspital Bern"
            className="w-[160px]"
          />
          <img src="/brz_logo.png" alt="Berner Reha Zentrum" className="w-[160px]" />
        </div>

        <Section className="mt-8">
          <Button
            onClick={() => {
              handleLogout();
            }}
            className="
            rounded-full border border-accent p-4 pl-5 gap-2
            shadow-none bg-zinc-50
            text-zinc-800 text-lg font-medium
            hover:bg-zinc-100 focus:bg-zinc-100"
          >
            {t('Logout')}
            <LogoutFill className="w-6 h-6" />
          </Button>
        </Section>

        <div className="flex flex-col gap-1 mt-8">
          <Link to="/terms">{t('Terms & Conditions')}</Link>
          <Link to="/privacypolicy">{t('Privacy Policy')}</Link>
          <div>
            &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('All rights reserved.')}
          </div>
        </div>
      </Layout>

      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
});

export default PatientProfile;
