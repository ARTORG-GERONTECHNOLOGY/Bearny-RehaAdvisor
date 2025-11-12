import { FunctionComponent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
const Footer: FunctionComponent = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-body-tertiary py-4 mt-auto w-100">
      <div className="container-fluid">
        <div className="row">
          <div className="col-12 text-center text-md-start px-3">
            <small className="d-block">
              &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('All rights reserved.')}
            </small>
            <div className="d-flex justify-content-center justify-content-md-start gap-3 mt-2 flex-wrap">
              <NavLink to="/terms" className="text-decoration-underline small">
                {t('Terms & Conditions')}
              </NavLink>
              <NavLink to="/privacypolicy" className="text-decoration-underline small">
                {t('Privacy Policy')}
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
