import React from 'react';
import {
  Button,
  Container,
  Dropdown,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { BsQuestionCircle } from 'react-icons/bs';
import authStore from '../../stores/authStore';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../assets/styles/header.css';

import HelpCenter from '../help/HelpCenter';

import flagDe from '../../assets/flags/de.png';
import flagFr from '../../assets/flags/fr.png';
import flagEn from '../../assets/flags/gb.png';
import flagIt from '../../assets/flags/it.png';

type HeaderProps = {
  isLoggedIn: boolean;
  showRegisterAction?: boolean;
  onRegister?: () => void;
};

const Header: React.FC<HeaderProps> = ({ isLoggedIn, showRegisterAction, onRegister }) => {
  const { t, i18n } = useTranslation();
  const [helpOpen, setHelpOpen] = React.useState(false);
  const location = useLocation();

  const getInitialLang = () =>
    localStorage.getItem('i18nextLng')?.slice(0, 2) || i18n.language?.slice(0, 2) || 'en';

  const [currentLanguage, setCurrentLanguage] = React.useState(getInitialLang);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const handleLogout = async () => {
    await authStore.logout();
    window.location.href = '/';
  };

  const languages = ['de', 'fr', 'en', 'it'] as const;
  const languageOptions: Record<string, string> = {
    en: flagEn,
    de: flagDe,
    fr: flagFr,
    it: flagIt,
  };

  const normalizedLang = currentLanguage.slice(0, 2);
  const userType = authStore.userType?.toLowerCase();

  const navLinks = authStore.userType === 'Patient'
    ? [
        { path: '/patient', label: t('Home') },
      ]
    : authStore.userType === 'Therapist' || authStore.userType === 'Researcher'
    ? [
        { path: `/${userType}`, label: t('Patients') },
        { path: '/interventions', label: t('Interventions') },
        { path: '/userprofile', label: t('Profile') },
      ]
    : [];

  return (
    <>
      {/* FIRST ROW */}
      <nav
        className="sticky-top header-root px-2 px-sm-3 px-md-4 bg-body-tertiary"
        role="navigation"
      >
        <Container fluid className="px-2">
          <div className="d-flex align-items-center w-100">
            {/* --- Logos --- */}
            <div className="d-flex align-items-center gap-2 gap-sm-3 flex-wrap brand-wrap">
              <img src="/ARTORG_Logo.gif" alt="ARTORG Logo" className="brand-logo brand-logo--sm" />
              <img src="/insel.webp" alt="Inselspital Bern Logo" className="brand-logo d-none d-sm-block" />
              <img src="/brz_logo.png" alt="BRZ Logo" className="brand-logo d-none d-md-block" />
            </div>

            {/* --- Right Actions --- */}
            <div className="header-actions d-flex align-items-center gap-2 ms-auto">
              {showRegisterAction && !isLoggedIn && (
                <Button size="sm" onClick={onRegister}>
                  {t('Register (Only for Therapists)')}
                </Button>
              )}

              <OverlayTrigger placement="bottom" overlay={<Tooltip id="help-tip">{t('Help')}</Tooltip>}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  aria-label={t('Open help') as string}
                >
                  <BsQuestionCircle className="me-1" />
                  <span className="d-none d-sm-inline">{t('Help')}</span>
                </Button>
              </OverlayTrigger>

              {/* Language Switcher */}
              <Dropdown align="end">
                <Dropdown.Toggle id="lang" className="lang-toggle" variant="light">
                  <img
                    src={languageOptions[normalizedLang]}
                    alt={`${normalizedLang} flag`}
                    className="flag-icon"
                  />
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {languages.map((lang) => (
                    <Dropdown.Item
                      key={lang}
                      onClick={() => handleLanguageChange(lang)}
                      active={normalizedLang === lang}
                      className="d-flex align-items-center gap-2"
                    >
                      <img
                        src={languageOptions[lang]}
                        alt={`${lang} flag`}
                        className="flag-icon"
                      />
                      <span className="fw-medium">{lang.toUpperCase()}</span>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>

          {/* --- SECOND ROW: NAV LINKS + LOGOUT --- */}
          {isLoggedIn && navLinks.length > 0 && (
            <div className="nav-row">
              <div className="nav-left">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`nav-link ${
                      location.pathname === link.path ? 'active' : ''
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="logout-button">
                <Button variant="outline-dark" size="sm" onClick={handleLogout}>
                  {t('Logout')}
                </Button>
              </div>
            </div>
          )}
        </Container>
      </nav>

      {/* Help Center Modal */}
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default Header;
