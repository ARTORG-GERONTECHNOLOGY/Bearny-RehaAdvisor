import React from 'react';
import { ButtonGroup, Container, Nav, Navbar, ToggleButton } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import authStore from '../../stores/authStore';

const Header: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => {
  const { t, i18n } = useTranslation();

  // Available languages
  const languages = ['de', 'fr', 'en', 'it'];
  const [currentLanguage, setCurrentLanguage] = React.useState(i18n.language);

  // Change language handler
  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  // Handle user logout and redirect to home
  const handleLogout = () => {
    authStore.reset(); // Reset the auth store
    authStore.logout();
    window.location.href = '/'; // Redirect to home page after logout
  };

  return (
    <Navbar expand="lg" className="bg-body-tertiary">
      <Container className="d-flex justify-content-between">
        {/* Brand Logo */}
        <Navbar.Brand>
          <img
            src="/inselspital-bern_logo.png"
            alt={t('home')}
            style={{ width: '75px', height: '75px' }}
          />
        </Navbar.Brand>

        {/* Navbar Toggle for Small Screens */}
        {isLoggedIn && <Navbar.Toggle aria-controls="basic-navbar-nav" />}

        <Navbar.Collapse id="basic-navbar-nav">
          {isLoggedIn && (
            <>
              <Nav className="me-auto">
                {/* Conditional Links Based on User Type */}
                {authStore.userType === 'Patient' && (
                  <Nav.Link as={Link} to="/patient">{t('Home')}</Nav.Link>
                )}
                {(authStore.userType === 'Therapist' || authStore.userType === 'Researcher') && (
                  <>
                    <Nav.Link as={Link} to={`/${authStore.userType.toLowerCase()}`}>
                      {t('Patients')}
                    </Nav.Link>
                    <Nav.Link as={Link} to="/interventions">{t('Interventions')}</Nav.Link>
                    <Nav.Link as={Link} to="/userprofile">{t('Profile')}</Nav.Link>
                  </>
                )}
              </Nav>

              {/* Logout and Profile Links */}
              <Nav className="ms-auto">       
                <Nav.Link onClick={handleLogout}>{t('Logout')}</Nav.Link>
              </Nav>
            </>
          )}

          {/* Language Selector */}
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
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;
