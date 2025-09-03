import React from 'react';
import {
  Button,
  ButtonGroup,
  Container,
  Dropdown,
  Nav,
  Navbar,
  OverlayTrigger,
  ToggleButton,
  Tooltip,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BsQuestionCircle } from 'react-icons/bs';
import authStore from '../../stores/authStore';

// Help Center (the modal described previously)
import HelpCenter from '../help/HelpCenter';

// Flag imports
import flagDe from '../../assets/flags/de.png';
import flagFr from '../../assets/flags/fr.png';
import flagEn from '../../assets/flags/gb.png';
import flagIt from '../../assets/flags/it.png';

const Header: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => {
  const { t, i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = React.useState(i18n.language);
  const [helpOpen, setHelpOpen] = React.useState(false);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const handleLogout = async () => {
    await authStore.logout();
    window.location.href = '/';
  };

  const languages = ['de', 'fr', 'en', 'it'];
  const languageOptions: Record<string, string> = {
    en: flagEn,
    de: flagDe,
    fr: flagFr,
    it: flagIt,
  };

  // If i18n gives "en-US", normalize to "en" for flag lookup
  const normalizedLang = (currentLanguage || 'en').slice(0, 2);

  return (
    <>
      <Navbar expand="lg" className="bg-body-tertiary px-2 px-sm-3 px-md-4">
        <Container fluid className="d-flex justify-content-between align-items-center">
          {/* Brand */}
          <Navbar.Brand>
                        <img
              src="/ARTORG_Logo.gif"
              alt="Logo"
              style={{ width: '75px', height: '75px' }}
            />
            <img
              src="/insel.webp"
              alt="Logo"
              style={{ width: '225px', height: '100px' }}
            />

            <img
              src="/brz_logo.png"
              alt="Logo"
              style={{ width: '175px', height: '75px' }}
            />
          </Navbar.Brand>
                  

          {/* Small screens: Help + Language dropdown block */}
          <div className="ms-auto d-lg-none d-flex align-items-center gap-2">
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip id="help-tooltip">{t('Help')}</Tooltip>}
            >
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setHelpOpen(true)}
                aria-label={t('Open help')}
              >
                <BsQuestionCircle />
              </Button>
            </OverlayTrigger>

            <Dropdown align="end">
              <Dropdown.Toggle
                variant="light"
                id="language-dropdown"
                className="d-flex align-items-center p-1"
                style={{
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                }}
              >
                <img
                  src={languageOptions[normalizedLang]}
                  alt={normalizedLang}
                  style={{
                    width: '40px',
                    height: '28px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                  }}
                />
              </Dropdown.Toggle>

              <Dropdown.Menu>
                {Object.entries(languageOptions).map(([lang, flag]) => (
                  <Dropdown.Item
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className="text-center"
                  >
                    <img
                      src={flag}
                      alt={lang}
                      style={{
                        width: '40px',
                        height: '28px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                      }}
                    />
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>

          {/* Navbar toggle */}
          <Navbar.Toggle aria-controls="basic-navbar-nav" />

          <Navbar.Collapse id="basic-navbar-nav">
            {isLoggedIn && (
              <Nav className="me-auto">
                {authStore.userType === 'Patient' && (
                  <Nav.Link as={Link} to="/patient">
                    {t('Home')}
                  </Nav.Link>
                )}
                {(authStore.userType === 'Therapist' || authStore.userType === 'Researcher') && (
                  <>
                    <Nav.Link as={Link} to={`/${authStore.userType.toLowerCase()}`}>
                      {t('Patients')}
                    </Nav.Link>
                    <Nav.Link as={Link} to="/interventions">
                      {t('Interventions')}
                    </Nav.Link>
                    <Nav.Link as={Link} to="/userprofile">
                      {t('Profile')}
                    </Nav.Link>
                  </>
                )}
                <Nav.Link onClick={handleLogout}>{t('Logout')}</Nav.Link>
              </Nav>
            )}

            {/* Large screens: Help button + language toggles on the far right */}
            <div className="d-none d-lg-flex ms-auto align-items-center gap-2">
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip id="help-tooltip-lg">{t('Help')}</Tooltip>}
              >
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  aria-label={t('Open help')}
                >
                  <BsQuestionCircle className="me-1" />
                  {t('Help')}
                </Button>
              </OverlayTrigger>

              <ButtonGroup className="ms-2">
                {languages.map((lang) => (
                  <ToggleButton
                    key={lang}
                    type="radio"
                    variant={lang === normalizedLang ? 'dark' : 'light'}
                    value={lang}
                    checked={normalizedLang === lang}
                    onChange={() => handleLanguageChange(lang)}
                    id={lang}
                  >
                    {lang.toUpperCase()}
                  </ToggleButton>
                ))}
              </ButtonGroup>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* Help Center Modal */}
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default Header;
