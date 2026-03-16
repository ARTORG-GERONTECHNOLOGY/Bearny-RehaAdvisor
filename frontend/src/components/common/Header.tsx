import React from 'react';
import { Button, Container, Dropdown, OverlayTrigger, Tooltip, Navbar, Nav } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { BsQuestionCircle } from 'react-icons/bs';
import authStore from '../../stores/authStore';

import HelpCenter from '../help/HelpCenter';

import flagDe from '../../assets/flags/de.png';
import flagFr from '../../assets/flags/fr.png';
import flagEn from '../../assets/flags/gb.png';
import flagIt from '../../assets/flags/it.png';

import '../../assets/styles/header.css';

type HeaderProps = {
  isLoggedIn: boolean;
  showRegisterAction?: boolean;
  onRegister?: () => void;
};

const Header: React.FC<HeaderProps> = ({ isLoggedIn, showRegisterAction, onRegister }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const [helpOpen, setHelpOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const getInitialLang = () =>
    localStorage.getItem('i18nextLng')?.slice(0, 2) || i18n.language?.slice(0, 2) || 'en';

  const [currentLanguage, setCurrentLanguage] = React.useState(getInitialLang);

  const languages = ['de', 'fr', 'en', 'it'] as const;

  const flagMap: Record<string, string> = {
    en: flagEn,
    de: flagDe,
    fr: flagFr,
    it: flagIt,
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

  const userType = authStore.userType?.toLowerCase();

  // NAV LINKS
  const navLinks =
    authStore.userType === 'Patient'
      ? [
          { path: '/patient', label: t('Home') },
          { path: '/patient-interventions', label: t('Interventions') }, // ✅ NEW
        ]
      : authStore.userType === 'Therapist' || authStore.userType === 'Researcher'
        ? [
            { path: `/${userType}`, label: t('Patients') },
            { path: '/interventions', label: t('Interventions') },
            { path: '/userprofile', label: t('Profile') },
          ]
        : authStore.userType === 'Admin'
          ? [] // ✅ Admin: no nav links, only logout button
          : [];

  const hasNav = isLoggedIn && (navLinks.length > 0 || authStore.userType === 'Admin');

  return (
    <>
      <Navbar
        // IMPORTANT: disable Bootstrap auto-expand so mobile collapse
        // is not shown on tablet/desktop.
        expand={false}
        expanded={expanded}
        collapseOnSelect
        bg="light"
        className="shadow-sm"
        sticky="top"
      >
        <Container fluid className="header-container d-flex flex-column">
          {/* ===================== ROW 1: LOGOS + TOP ACTIONS ===================== */}
          <div className="header-top-row d-flex align-items-center justify-content-between w-100">
            {/* LOGOS LEFT */}
            <Navbar.Brand className="brand-zone d-flex align-items-center">
              <img src="/artorg_logo.gif" className="brand-logo" />
              <img src="/insel_logo.svg" className="brand-logo d-none d-sm-inline" />
              <img src="/brz_logo.png" className="brand-logo d-none d-md-inline" />
            </Navbar.Brand>

            {/* ACTIONS RIGHT (Help, Lang, Register on md+) */}
            <div className="action-zone d-flex align-items-center gap-2 ms-auto justify-content-end">
              {/* REGISTER (tablet + desktop, logged out) */}
              {!isLoggedIn && showRegisterAction && (
                <Button size="sm" onClick={onRegister} className="d-none d-md-inline-block">
                  {t('Register (Only for Therapists)')}
                </Button>
              )}
              {/* HELP (tablet + desktop) */}
              <OverlayTrigger placement="bottom" overlay={<Tooltip>{t('Help')}</Tooltip>}>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  className="help-btn d-none d-md-inline-flex"
                >
                  <BsQuestionCircle size={18} />
                </Button>
              </OverlayTrigger>

              {/* LANGUAGE (tablet + desktop) */}
              <Dropdown align="end" className="d-none d-md-inline">
                <Dropdown.Toggle id="lang-tgl" className="lang-btn" variant="light" size="sm">
                  <img src={flagMap[lang]} className="flag-icon" />
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {languages.map((l) => (
                    <Dropdown.Item key={l} onClick={() => handleLanguageChange(l)}>
                      <img src={flagMap[l]} className="flag-icon me-2" />
                      {l.toUpperCase()}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>

              {/* BURGER (mobile only) */}
              <Navbar.Toggle
                aria-controls="main-nav"
                className="d-md-none ms-2"
                onClick={() => setExpanded(!expanded)}
              />
            </div>
          </div>

          {/* ===================== ROW 2: NAV LINKS + LOGOUT (TABLET/DESKTOP) ===================== */}
          {hasNav && (
            <div className="nav-second-row d-none d-md-flex w-100 mt-2 align-items-center">
              <Nav className="flex-row nav-links w-100 align-items-center gap-3">
                {navLinks.map((lnk) => (
                  <Nav.Link
                    key={lnk.path}
                    as={Link}
                    to={lnk.path}
                    className={`nav-item-link ${location.pathname === lnk.path ? 'active' : ''}`}
                  >
                    {lnk.label}
                  </Nav.Link>
                ))}

                {/* Admin: only logout is shown (no nav links) */}
                {/* Push logout to the far right, but keep it same style */}
                <Nav.Link
                  as="button"
                  type="button"
                  onClick={handleLogout}
                  className="nav-item-link nav-logout ms-auto"
                >
                  <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
                  {t('Logout')}
                </Nav.Link>
              </Nav>
            </div>
          )}

          {/* ===================== MOBILE COLLAPSE ===================== */}
          <Navbar.Collapse id="main-nav" className="w-100 d-md-none">
            <div className="w-100 mt-2 d-flex flex-column">
              <div className="ms-auto text-end d-flex flex-column gap-2 align-items-end">
                {/* NAV LINKS (mobile, if any) */}
                {isLoggedIn &&
                  navLinks.map((lnk) => (
                    <Button
                      key={lnk.path}
                      variant="link"
                      className={
                        location.pathname === lnk.path
                          ? 'p-0 fw-bold text-decoration-none'
                          : 'p-0 text-decoration-none'
                      }
                      as={Link}
                      to={lnk.path}
                      onClick={() => setExpanded(false)}
                    >
                      {lnk.label}
                    </Button>
                  ))}

                {/* LOGOUT (mobile, when logged in) */}
                {isLoggedIn && (
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => {
                      setExpanded(false);
                      handleLogout();
                    }}
                  >
                    {t('Logout')}
                  </Button>
                )}

                {/* HELP (mobile) */}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    setExpanded(false);
                    setHelpOpen(true);
                  }}
                  className="help-btn"
                >
                  <BsQuestionCircle size={18} /> {t('Help')}
                </Button>

                {/* LANGUAGE (mobile) */}
                <Dropdown align="end">
                  <Dropdown.Toggle
                    id="lang-tgl-mobile"
                    className="lang-btn"
                    variant="light"
                    size="sm"
                  >
                    <img src={flagMap[lang]} className="flag-icon" /> {lang.toUpperCase()}
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    {languages.map((l) => (
                      <Dropdown.Item key={l} onClick={() => handleLanguageChange(l)}>
                        <img src={flagMap[l]} className="flag-icon me-2" />
                        {l.toUpperCase()}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>

                {/* REGISTER (mobile, logged out) */}
                {!isLoggedIn && showRegisterAction && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setExpanded(false);
                      onRegister && onRegister();
                    }}
                  >
                    {t('Register (Only for Therapists)')}
                  </Button>
                )}
              </div>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default Header;
