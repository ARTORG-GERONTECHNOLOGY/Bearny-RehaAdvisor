import { FunctionComponent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import PwaInstallSheet, { useIsStandalone } from '@/components/PwaInstallSheet';
import { Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { SUPPORTED_LANGUAGES, LANGUAGE_FLAGS } from '@/constants/languages';
import Container from '@/components/Container';

const Footer: FunctionComponent = () => {
  const { t, i18n } = useTranslation();

  const [showPwaInstall, setShowPwaInstall] = useState(false);
  const isAppInstalled = useIsStandalone();

  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);

  const handleLanguageChange = (l: string) => {
    i18n.changeLanguage(l);
  };

  return (
    <>
      <footer className="bg-white py-4">
        <Container>
          <div className="flex flex-wrap gap-1 justify-center md:justify-start w-full mb-4">
            <img
              src="/artorg_unibern_logo.gif"
              alt="ARTORG Center for Biomedical Engineering Research"
              className="h-8"
            />
            <img
              src="/insel_logo.svg"
              alt="Inselspital - Universitatsspital Bern"
              className="h-8"
            />
            <img src="/brz_logo.png" alt="Berner Reha Zentrum" className="h-8" />
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-wrap">
            <div className="flex flex-col items-center md:items-start">
              <div className="flex gap-1 flex-wrap">
                <NavLink to="/terms" className="text-sm text-muted-foreground underline">
                  {t('Terms & Conditions')}
                </NavLink>
                <a href="/privacy-policy.html" className="text-sm text-muted-foreground underline">
                  {t('Privacy Policy')}
                </a>
              </div>
              <div className="text-sm">
                &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('Allrightsreserved')}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-0 border-none bg-transparent" aria-label={t('Language')}>
                    <img src={LANGUAGE_FLAGS[lang]} className="h-5" alt="" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <DropdownMenuItem key={l} onClick={() => handleLanguageChange(l)}>
                      <img src={LANGUAGE_FLAGS[l]} className="h-5" alt="" />
                      {l.toUpperCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Container>
      </footer>

      <PwaInstallSheet open={showPwaInstall} onOpenChange={setShowPwaInstall} />
    </>
  );
};

export default Footer;
