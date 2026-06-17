import React from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';

const PrivacyPolicy: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Layout aria-label={t('Privacy Policy')}>
      <PageHeader title={t('Privacy Policy')} />
      <p>
        <strong>Effective Date:</strong> May 9, 2025
      </p>

      <p>
        This web application is operated for <strong>research purposes only</strong>. We are
        committed to protecting your privacy and ensuring transparency in how your data is used.
      </p>

      <h4>1. Data Collection</h4>
      <p>We collect only the information necessary for research, such as:</p>
      <ul>
        <li>Basic demographic data (e.g., age, sex, education)</li>
        <li>Your responses to research-related questionnaires or activities</li>
        <li>Technical logs to maintain system integrity (e.g., IP address, device type)</li>
      </ul>
      <p>
        We do <strong>not</strong> collect personal identifiers such as names, addresses, or
        financial data unless explicitly requested and consented to.
      </p>

      <h4>2. Use of Data</h4>
      <p>
        Collected data is used <strong>solely for research and academic analysis</strong>. It will
        not be sold, rented, or shared for marketing purposes. All data is anonymized or
        pseudonymized before analysis where feasible.
      </p>

      <h4>3. Data Storage</h4>
      <p>
        Data is stored securely in compliance with ethical research standards. Access is limited to
        authorized research personnel only.
      </p>

      <h4>4. Consent</h4>
      <p>
        By using this application, you provide your <strong>informed consent</strong> to the
        collection and use of data as described in this policy. If you do not agree, please do not
        continue to use the application.
      </p>

      <h4>5. Your Rights</h4>
      <p>You may:</p>
      <ul>
        <li>Request to view the data you provided</li>
        <li>Withdraw from the study at any time</li>
        <li>Request deletion of your data (where identifiable)</li>
      </ul>
      <p>
        To exercise any of these rights, contact the research team through the contact form or email
        listed in the app.
      </p>

      <h4>6. Changes to This Policy</h4>
      <p>
        We may update this policy as needed to reflect legal or methodological changes. Any updates
        will be posted within the application.
      </p>

      <h4>7. Google Health &amp; Fitness API Data</h4>
      <p>
        Bearny integrates with the <strong>Google Fit / Google Health REST API</strong> to collect
        wearable health metrics for rehabilitation monitoring. This section explains how we handle
        data obtained through Google APIs.
      </p>
      <p>
        <strong>Scopes requested and their purpose:</strong>
      </p>
      <ul>
        <li>
          <strong>fitness.activity.read</strong> — Daily step count, walking distance, calories
          burned, and active minutes. Used to track whether the patient is meeting their prescribed
          movement goals during rehabilitation.
        </li>
        <li>
          <strong>fitness.heart_rate.read</strong> — Resting heart rate and time spent in heart rate
          zones (fat-burn, cardio, peak). Used to verify that the patient is exercising at the
          correct intensity as specified in their rehabilitation plan.
        </li>
        <li>
          <strong>fitness.sleep.read</strong> — Sleep duration, time actually asleep, and number of
          awakenings. Sleep quality is a key recovery indicator in post-surgical rehabilitation.
        </li>
        <li>
          <strong>fitness.body.read</strong> — Body weight data. Tracked alongside other health
          metrics where clinically relevant to the patient's rehabilitation outcome.
        </li>
        <li>
          <strong>fitness.oxygen_saturation.read</strong> — Blood oxygen saturation (SpO2). An
          important safety and recovery metric for patients with cardiopulmonary conditions.
        </li>
        <li>
          <strong>fitness.body_temperature.read</strong> — Skin temperature data. An early indicator
          of post-operative infection or inflammation.
        </li>
      </ul>
      <p>
        <strong>Data protection commitments:</strong>
      </p>
      <ul>
        <li>
          Google Health data is accessible only to the patient and their assigned physiotherapist.
        </li>
        <li>
          Bearny accesses Google Health data in <strong>read-only</strong> mode — we never write,
          modify, or delete data in your Google account.
        </li>
        <li>
          Google Health data is <strong>not sold, rented, or shared</strong> with any third party,
          and is <strong>not used for advertising</strong> or any commercial purpose.
        </li>
        <li>
          Data is stored on servers located in <strong>Switzerland</strong> and subject to the same
          access controls as all other Bearny data.
        </li>
        <li>
          Our use of Google API data is limited to the purposes described here and does not extend
          to any use prohibited by the Google API Services User Data Policy.
        </li>
      </ul>
      <p>
        You can revoke Bearny's access to your Google Health data at any time via your Google
        Account permissions page, or by contacting us to request deletion of stored data.
      </p>
    </Layout>
  );
};

export default PrivacyPolicy;
