import { FunctionComponent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import PwaInstallSheet, { useIsStandalone } from '@/components/PwaInstallSheet';
import { Download } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';

import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';

const Footer: FunctionComponent = () => {
  const { t, i18n } = useTranslation();

  const [showPwaInstall, setShowPwaInstall] = useState(false);
  const isAppInstalled = useIsStandalone();

  const getInitialLang = () =>
    localStorage.getItem('i18nextLng')?.slice(0, 2) || i18n.language?.slice(0, 2) || 'en';

  const [currentLanguage, setCurrentLanguage] = useState(getInitialLang);

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

  return (
    <>
      <footer className="bg-white py-4">
        <div className="container-fluid">
          <div className="flex justify-center md:block w-full mb-4">
            <img src="/artorg_unibern_logo.gif" className="h-8" />
            <img src="/insel_logo.svg" className="h-8" />
            <img src="/brz_logo.png" className="h-8" />
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-wrap">
            <div className="text-center text-md-start">
              <div className="text-sm">
                &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('Allrightsreserved')}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap items-center justify-center">
                <NavLink to="/terms" className="text-sm">
                  {t('Terms & Conditions')}
                </NavLink>
                <NavLink to="/privacypolicy" className="text-sm">
                  {t('Privacy Policy')}
                </NavLink>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!isAppInstalled && (
                <button
                  onClick={() => setShowPwaInstall(true)}
                  className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors border-none"
                >
                  <Download className="h-4 w-4" />
                  {t('pwa.title')}
                </button>
              )}
              <Dropdown>
                <Dropdown.Toggle className="p-0" variant="light" size="sm">
                  <img src={flagMap[lang]} className="h-5" />
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {languages.map((l) => (
                    <Dropdown.Item key={l} onClick={() => handleLanguageChange(l)}>
                      <img src={flagMap[l]} className="h-5 me-2" />
                      {l.toUpperCase()}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>
        </div>
      </footer>

      <PwaInstallSheet open={showPwaInstall} onOpenChange={setShowPwaInstall} />
    </>
  );
};

export default Footer;
