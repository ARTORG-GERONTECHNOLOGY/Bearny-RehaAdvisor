import { FunctionComponent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import PwaInstallSheet, { useIsStandalone } from '@/components/PwaInstallSheet';
import { Download } from 'lucide-react';

const Footer: FunctionComponent = () => {
  const { t } = useTranslation();

  const [showPwaInstall, setShowPwaInstall] = useState(false);
  const isAppInstalled = useIsStandalone();

  return (
    <>
      <footer className="bg-white py-4">
        <div className="container-fluid">
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
            {!isAppInstalled && (
              <button
                onClick={() => setShowPwaInstall(true)}
                className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                {t('pwa.title')}
              </button>
            )}
          </div>
        </div>
      </footer>

      <PwaInstallSheet open={showPwaInstall} onOpenChange={setShowPwaInstall} />
    </>
  );
};

export default Footer;
