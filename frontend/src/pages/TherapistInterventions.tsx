import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import ProductPopup from '../components/TherapistInterventionPage/ProductPopup';
import FilterBar from '../components/TherapistInterventionPage/FilterBar';
import InterventionList from '../components/TherapistInterventionPage/InterventionList';
import AddInterventionPopup from '../components/AddIntervention/AddRecomendationPopUp';
import ErrorAlert from '../components/common/ErrorAlert';
import config from '../config/config.json';
import apiClient from '../api/client';
import authStore from '../stores/authStore';
import { generateTagColors } from '../utils/interventions';
import { InterventionTypeTh } from '../types/index';

const TherapistRecomendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState<InterventionTypeTh[]>([]);
  const [filteredInterventions, setFilteredInterventions] = useState<InterventionTypeTh[]>([]);
  const [selectedItem, setSelectedItem] = useState<InterventionTypeTh | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showPopupAdd, setShowPopupAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [coreSupportFilter, setCoreSupportFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { t } = useTranslation();
  const tagColors = generateTagColors(config.RecomendationInfo.tags);

  const specialisations = authStore.specialisation?.split(',').map((s) => s.trim()) || [];

  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations as string]?.diagnosis || [];

  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await authStore.checkAuthentication();   // <-- wait for hydration
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!authChecked) return; // wait until check finished

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    fetchData();
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate]);
  const fetchData = async () => {
    try {
      const res = await apiClient.get<InterventionTypeTh[]>('interventions/all/');
      setRecommendations(res.data);
      setFilteredInterventions(res.data);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      setError(t('Error fetching recommendations. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  // Filtering logic
  useEffect(() => {
    let filtered = [...recommendations];

    if (patientTypeFilter) {
      filtered = filtered.filter((rec) =>
        rec.patient_types.some((pt) => pt.diagnosis === patientTypeFilter)
      );
    }

    if (coreSupportFilter) {
      filtered = filtered.filter((rec) =>
        rec.patient_types.some((pt) =>
          coreSupportFilter === 'Core' ? pt.include_option : !pt.include_option
        )
      );
    }

    if (contentTypeFilter) {
      filtered = filtered.filter((rec) => rec.content_type === contentTypeFilter);
    }

    if (tagFilter.length > 0) {
      filtered = filtered.filter((rec) => rec.tags.some((tag) => tagFilter.includes(tag)));
    }

    if (benefitForFilter.length > 0) {
      filtered = filtered.filter((rec) => rec.benefitFor.some((b) => benefitForFilter.includes(b)));
    }

    if (frequencyFilter) {
      filtered = filtered.filter((rec) =>
        rec.patient_types.some((pt) => pt.frequency === frequencyFilter)
      );
    }

    if (searchTerm) {
      filtered = filtered.filter((rec) =>
        rec.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredInterventions(filtered);
  }, [
    searchTerm,
    patientTypeFilter,
    coreSupportFilter,
    contentTypeFilter,
    tagFilter,
    benefitForFilter,
    frequencyFilter,
    recommendations,
  ]);

  const handleOpen = () => setShowPopupAdd(true);
  const handleClose = () => setShowPopupAdd(false);
  const handleItemClick = (item: InterventionTypeTh) => {
    setSelectedItem(item);
    setShowPopup(true);
  };
  const handleClosePopup = () => {
    setSelectedItem(null);
    setShowPopup(false);
  };

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />
      <Container className="main-content mt-4">
        <WelcomeArea user="TherapistPatients" />
        <Row>
          <Col>
            {error && (
              <ErrorAlert
                message={error}
                onClose={() => {
                  setError('');
                }}
              />
            )}
          </Col>
        </Row>

        <Row className="mb-3">
          <Col xs={12} md="auto">
            <Button onClick={handleOpen} className="btn-primary">
              {t('Add Intervention')}
            </Button>
          </Col>
        </Row>

        <Row className="mb-4">
          <Col xs={12}>
            <FilterBar
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              patientTypeFilter={patientTypeFilter}
              setPatientTypeFilter={setPatientTypeFilter}
              coreSupportFilter={coreSupportFilter}
              setCoreSupportFilter={setCoreSupportFilter}
              contentTypeFilter={contentTypeFilter}
              setContentTypeFilter={setContentTypeFilter}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              benefitForFilter={benefitForFilter}
              setBenefitForFilter={setBenefitForFilter}
              frequencyFilter={frequencyFilter}
              setFrequencyFilter={setFrequencyFilter}
              diagnoses={diagnoses}
              config={config}
              t={t}
            />
          </Col>
        </Row>

        <Row>
          <Col xs={12}>
            <InterventionList
              items={filteredInterventions}
              onClick={handleItemClick}
              t={t}
              tagColors={tagColors}
            />
          </Col>
        </Row>
      </Container>

      {selectedItem && (
        <ProductPopup
          item={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
          tagColors={tagColors}
        />
      )}

      <AddInterventionPopup show={showPopupAdd} handleClose={handleClose} onSuccess={fetchData} />

      <Footer />
    </div>
  );
};

export default TherapistRecomendations;
