import React from 'react';
import { ButtonGroup, Container, Dropdown, Nav, Navbar, ToggleButton } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import authStore from '../../stores/authStore';

// Flag imports
import flagDe from '../../assets/flags/de.png';
import flagFr from '../../assets/flags/fr.png';
import flagEn from '../../assets/flags/gb.png';
import flagIt from '../../assets/flags/it.png';

const Header: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => {
  const { t, i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = React.useState(i18n.language);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const handleLogout = async () => {
    await authStore.logout();
    window.location.href = '/';
  };

  const languages = ['de', 'fr', 'en', 'it'];
  const languageOptions = {
    en: flagEn,
    de: flagDe,
    fr: flagFr,
    it: flagIt,
  };

  return (
    <Navbar expand="lg" className="bg-body-tertiary px-2 px-sm-3 px-md-4">
      <Container fluid className="d-flex justify-content-between align-items-center">
        {/* Brand */}
        <Navbar.Brand>
          <img
            src="/inselspital-bern_logo.png"
            alt="Logo"
            style={{ width: '75px', height: '75px' }}
          />
        </Navbar.Brand>

        {/* Language selector: small screens (dropdown) */}
        <div className="ms-auto d-lg-none">
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
                src={languageOptions[currentLanguage]}
                alt={currentLanguage}
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

        {/* Toggle button: always available on small screens */}
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

          {/* Language selector: large screens (toggle buttons) */}
          <div className="d-none d-lg-block ms-auto">
            <ButtonGroup className="ms-3">
              {languages.map((lang) => (
                <ToggleButton
                  key={lang}
                  type="radio"
                  variant={lang === currentLanguage ? 'dark' : 'light'}
                  value={lang}
                  checked={currentLanguage === lang}
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
  );
};

export default Header;
