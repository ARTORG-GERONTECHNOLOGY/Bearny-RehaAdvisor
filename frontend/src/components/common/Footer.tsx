import { FunctionComponent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom'; // Make sure you're using React Router

const Footer: FunctionComponent = () => {
  const { t } = useTranslation();

  return (
    <footer
      className="bg-body-tertiary py-4 mt-auto w-100"
      style={{ width: '100%', position: 'relative' }}
    >
      <div className="container-fluid">
        <div className="row">
          <div className="col text-center">
            <small>
              &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('All rights reserved.')}
              {' | '}
              <Link to="/terms" className="text-decoration-underline">
                {t('Terms & Conditions')}
              </Link>
              {' | '}
              <Link to="/privacypolicy" className="text-decoration-underline">
                {t('Privacy Policy')}
              </Link>
            </small>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
