// src/pages/PatientView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';
import ActivitySummary from '@/components/PatientPage/ActivitySummary';
import DailyVitalsPrompt from '@/components/PatientPage/DailyVitalsPrompt';
import DailyInterventionCard from '@/components/PatientPage/DailyInterventionCard';
import PatientPopupContainer from '@/components/PatientPage/PatientPopupContainer';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import PatientQuestionaire from '@/components/PatientPage/PatientQuestionaire';
import authStore from '@/stores/authStore';
import { patientUiStore } from '@/stores/patientUiStore';
import { patientInterventionsStore } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { useInterventions } from '@/hooks/useInterventions';
import { useInterventionPopup } from '@/hooks/useInterventionPopup';
import type { PatientType } from '@/types';
import HomeIllustration from '@/assets/home_illustration.svg?react';

import '@/assets/styles/patient.css';

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const { selectedIntervention, openIntervention, closeIntervention } = useInterventionPopup();

  const fitbitStatus = useMemo(() => searchParams.get('fitbit_status'), [searchParams]);
  const patientId = localStorage.getItem('id') || authStore.id || '';

  // Get today's interventions completion count for badge
  const today = useMemo(() => new Date(), []);
  const { completionCount } = useInterventions(today);
  const completionBadge =
    completionCount.total > 0 ? `${completionCount.completed}/${completionCount.total}` : undefined;

  // Safe questions array for health questionnaire
  const safeHealthQuestions = Array.isArray(patientQuestionnairesStore.healthQuestions)
    ? patientQuestionnairesStore.healthQuestions
    : [];

  useEffect(() => {
    let alive = true;

    const run = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;

      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
        return;
      }

      if (fitbitStatus === 'error') setPageError(String(t('Fitbit connection failed.')));

      // Load interventions and questionnaires if patient is authenticated
      if (patientId) {
        patientInterventionsStore.fetchPlan(patientId, i18n.language);
        patientQuestionnairesStore.checkInitialQuestionnaire(patientId);
        patientQuestionnairesStore.loadHealthQuestionnaire(patientId, i18n.language);
      }

      setLoading(false);
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate, fitbitStatus, t, patientId, i18n.language]);

  if (loading) return null;

  return (
    <Layout>
      <div aria-label={t('Week range and current month')}>
        <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{t('today')}</h1>
        <h2 className="text-lg p-0 m-0 text-zinc-600">
          {new Date().toLocaleDateString(t('locale'), { day: 'numeric', month: 'long' })}
        </h2>
      </div>

      <HomeIllustration className="absolute right-0 top-12 md:top-24" />

      <div className="mt-16 d-flex flex-column">
        <div className="flex-grow-1">
          <Container fluid className="patient-container">
            <Row className="patient-section justify-content-center py-10">
              <Col xs={12} sm={11} md={10} lg={8}>
                <DailyInterventionCard
                  date={today}
                  title={t('Your recommendations') || 'Deine Empfehlungen'}
                  badgeText={completionBadge}
                  onOpenIntervention={openIntervention}
                />
              </Col>
            </Row>

            <Row className="patient-section justify-content-center">
              <Col xs={12} sm={11} md={10} lg={8} className="text-center">
                <FitbitConnectButton />
              </Col>
            </Row>

            <Row className="patient-section justify-content-center">
              <Col xs={12} sm={11} md={10} lg={8}>
                <DailyVitalsPrompt />
              </Col>
            </Row>

            {pageError ? (
              <Row className="patient-section justify-content-center">
                <Col xs={12} sm={11} md={10} lg={8}>
                  <ErrorAlert message={pageError} onClose={() => setPageError('')} />
                </Col>
              </Row>
            ) : null}

            <Row className="patient-section justify-content-center">
              <Col xs={12} sm={11} md={10} lg={8}>
                <ActivitySummary selectedDate={patientUiStore.selectedDate} />
              </Col>
            </Row>
          </Container>
        </div>

        {/* Intervention Popups (shared with PatientPlan) */}
        <PatientPopupContainer
          selectedIntervention={selectedIntervention}
          onCloseIntervention={closeIntervention}
        />

        {/* Health Questionnaire Popup (only on Patient home page) */}
        {patientQuestionnairesStore.showHealthPopup && (
          <FeedbackPopup
            show
            interventionId=""
            questions={safeHealthQuestions}
            date={format(patientUiStore.selectedDate, 'yyyy-MM-dd')}
            onClose={() => patientQuestionnairesStore.closeHealth()}
          />
        )}

        {/* Initial Patient Questionnaire (only on Patient home page) */}
        {patientQuestionnairesStore.showInitialPopup && (
          <PatientQuestionaire
            patient_id={{ _id: patientId } as PatientType}
            show
            handleClose={() => patientQuestionnairesStore.closeInitial()}
          />
        )}
      </div>
    </Layout>
  );
});

export default PatientView;
