import React from 'react';
import { Navbar, Nav, Container } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import authStore from '../../stores/authStore';

// Import flag assets
// @ts-ignore
import flagEN from '../../assets/flags/gb.png';
// @ts-ignore
import flagIT from '../../assets/flags/it.png';
// @ts-ignore
import flagFR from '../../assets/flags/fr.png';
// @ts-ignore
import flagDE from '../../assets/flags/de.png';



interface HeaderProps {
  isLoggedIn: boolean;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn }) => {
  const { t, i18n } = useTranslation();

  // Function to switch the current language
  const switchLanguage = () => {
    const languages = ['en', 'it', 'fr', 'de'];
    const currentLanguage = i18n.language;
    const nextIndex = (languages.indexOf(currentLanguage) + 1) % languages.length;
    i18n.changeLanguage(languages[nextIndex]);
  };

  // Function to return the correct flag based on the selected language
  const getFlag = () => {
    switch (i18n.language) {
      case 'en':
        return flagEN;
      case 'it':
        return flagIT;
      case 'fr':
        return flagFR;
      case 'de':
        return flagDE;
      default:
        return flagEN; // Default to English flag
    }
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
        {/* Unauthenticated state (when user is not logged in) */}
        {!isLoggedIn && (
          <>
            {/* Brand Logo */}
            <Navbar.Brand as={Link} to="/">
              <img src="/inselspital-bern_logo.png" alt={t('home')} style={{ width: '75px', height: '75px' }} />
            </Navbar.Brand>

            {/* Language Switcher */}
            <Navbar.Brand onClick={switchLanguage} style={{ cursor: 'pointer' }}>
              <img src={getFlag()} alt={t('switch language')} />
            </Navbar.Brand>
          </>
        )}

        {/* Authenticated state (when user is logged in) */}
        {isLoggedIn && (
          <>
            {/* Responsive Navbar Toggle */}
            <Navbar.Toggle aria-controls="basic-navbar-nav" />

            {/* Navbar Content */}
            <Navbar.Collapse id="basic-navbar-nav">
              {/* Navigation Links */}
              <Nav className="me-auto align-items-center ">
                {authStore.userType === 'Patient' && (<>
                  <Nav.Link as={Link} to="/patient">
                    <img src="/inselspital-bern_logo.png" alt={t('home')} style={{ width: '75px', height: '75px' }} />
                  </Nav.Link>
                  <Nav.Link as={Link} to="/patient">
                {t('Home')}
              </Nav.Link>
                </>)}
                {authStore.userType === 'Therapist' && (
                  <>
                    <Nav.Link as={Link} to="/therapist">
                      <img src="/inselspital-bern_logo.png" alt={t('Home')} style={{ width: '75px', height: '75px' }} />
                    </Nav.Link>
                  <Nav.Link as={Link} to="/therapist">{t('Home')}</Nav.Link>
                    <Nav.Link as={Link} to="/addpatient">{t('Add Patient')}</Nav.Link>
                  </>
                )}
                {

                  authStore.userType === 'Researcher' && (<>
                  <Nav.Link as={Link} to="/researcher">
                    <img src="/inselspital-bern_logo.png" alt={t('Home')} style={{ width: '75px', height: '75px' }} />
                  </Nav.Link>
                  <Nav.Link as={Link} to="/researcher">
                {t('Home')}
              </Nav.Link>
                  </>)}

                {/* Additional links for researchers and therapists */}
                {(authStore.userType === 'Researcher' || authStore.userType === 'Therapist') && (
                  <>
                    <Nav.Link as={Link} to="/addcontent">{t('Add Content')}</Nav.Link>
                    <Nav.Link as={Link} to="/userprofile">{t('Profile')}</Nav.Link>
                  </>
                )}
              </Nav>

              {/* Right-aligned navigation (logout button) */}
              <Nav className="ms-auto align-items-center">
                <Nav.Link onClick={handleLogout}>{t('Logout')}</Nav.Link>
              </Nav>
              {/*
              {(authStore.userType === 'researcher' || authStore.userType === 'therapist') && (
                <Navbar.Brand onClick={switchLanguage} style={{ cursor: 'pointer' }}>
                  <img src={getFlag()} alt={t('switch language')} />
                </Navbar.Brand>
              )}*/}
            </Navbar.Collapse>
          </>
        )}
      </Container>
    </Navbar>
  );
};

export default Header;
