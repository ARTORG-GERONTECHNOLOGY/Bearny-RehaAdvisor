import { FunctionComponent } from 'react';
import { useTranslation } from 'react-i18next';

const Footer: FunctionComponent = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-body-tertiary py-4 mt-auto w-100">
      <div className="container">

          {/* Navigation Links / Additional Information
          <div className="col-md-6 text-md-end">
            <ul className="list-unstyled">
              <li>
                <a href="/about" className="text-decoration-none">
                  {t("AboutUs")}
                </a>
              </li>
              <li>
                <a href="/contact" className="text-decoration-none">
                  {t("Contact")}
                </a>
              </li>
              <li>
                <a href="/privacy" className="text-decoration-none">
                  {t("PrivacyPolicy")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="row mt-4">
          <div className="col text-center">
            <small>&copy; {new Date().getFullYear()} {t("YourCompanyName")}. {t("Allrightsreserved.")}</small>
          </div>*/}
      </div>

    </footer>
  );
};

export default Footer;
