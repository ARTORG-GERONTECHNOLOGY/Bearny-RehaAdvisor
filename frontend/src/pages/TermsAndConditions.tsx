import React from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';

const TermsAndConditions: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Layout>
      <h1>{t('Terms and Conditions')}</h1>

      <p>
        {t(
          'This web application is provided for research purposes only. By accessing or using this platform, you agree to the following terms.'
        )}
      </p>

      <h4>{t('1. Research Use')}</h4>
      <p>
        {t(
          'The application is designed to support clinical and rehabilitation research. It is not intended for commercial use or general medical diagnosis.'
        )}
      </p>

      <h4>{t('2. Data Privacy')}</h4>
      <p>
        {t(
          'All user data collected through this platform is handled in accordance with ethical research guidelines and applicable data protection regulations.'
        )}
      </p>

      <h4>{t('3. No Guarantees')}</h4>
      <p>
        {t(
          'The application is provided "as is" without warranties of any kind. We make no guarantees regarding accuracy, reliability, or availability.'
        )}
      </p>

      <h4>{t('4. Consent')}</h4>
      <p>
        {t(
          'By using this platform, you consent to your data being used for scientific and academic purposes, in anonymized form.'
        )}
      </p>

      <h4>{t('5. Changes')}</h4>
      <p>
        {t(
          'These terms may be updated periodically. Continued use of the application implies acceptance of the revised terms.'
        )}
      </p>

      <p className="text-muted fst-italic">
        {t('If you have any questions or concerns, please contact the research team.')}
      </p>
    </Layout>
  );
};

export default TermsAndConditions;
