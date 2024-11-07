import React, { useEffect, useState } from 'react';
import { Button, ListGroup, Container, Row, Col, Form } from 'react-bootstrap';
import RecommendationPopup from '../components/RecommendationPopup';
import PatientPopup from '../components/PatientPopup';
import { useTranslation } from 'react-i18next';
import WelcomeArea from '../components/WelcomeArea';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import ProductPopup from '../components/ProductPopup';
import config from '../config/config.json';

const Therapist: React.FC = () => {
  const [view, setView] = useState<'patients' | 'recommendations'>('patients');
  const [patients, setPatients] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [durationFilter, setDurationFilter] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [coreSupportFilter, setCoreSupportFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const therapistId = authStore.id;

  const durationOptions = ['< 30 days', '30-60 days', '60-90 days', '> 90 days'];

  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    } else {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (authStore.isAuthenticated && authStore.userType === 'Therapist') {
      const fetchData = async () => {
        try {
          const patientResponse = await apiClient.get(`therapists/${therapistId}/patients`);
          const patientData = patientResponse.data//JSON.parse(patientResponse.data);
          setPatients(patientData);
          setFilteredPatients(patientData);

          const recommendationResponse = await apiClient.get('recommendations');
          setRecommendations(recommendationResponse.data);
          setFilteredRecommendations(recommendationResponse.data);
        } catch (error) {
          console.error('Error fetching data:', error);
        }
      };
      fetchData();
    }
  }, [therapistId]);

  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedItem(null);
  };

  const handleViewChange = (newView: 'patients' | 'recommendations') => {
    setView(newView);
    setSearchTerm('');
    setSelectedItem(null);
  };

  // Filter patients based on gender, duration, and search term
  useEffect(() => {
    let filtered = patients;

    if (genderFilter) {
      // @ts-ignore
      filtered = filtered.filter((patient) => patient.sex === genderFilter);
    }

    if (durationFilter) {
      filtered = filtered.filter((patient) => {
        // @ts-ignore
        const duration = patient.duration;
        if (durationFilter === '< 30 days') return duration < 30;
        if (durationFilter === '30-60 days') return duration >= 30 && duration <= 60;
        if (durationFilter === '60-90 days') return duration > 60 && duration <= 90;
        return duration > 90;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter((patient) =>
        // @ts-ignore
        patient.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredPatients(filtered);
  }, [genderFilter, durationFilter, searchTerm, patients]);

  // Filter recommendations based on selected filters and search term
  useEffect(() => {
    let filtered = recommendations;

    if (patientTypeFilter) {
      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.patient_types.some((pt: any) => pt.type === patientTypeFilter)
      );
    }

    if (coreSupportFilter) {
      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.patient_types.some((pt: any) =>
          // @ts-ignore
          coreSupportFilter === 'Core' ? pt.include_option : !pt.include_option
        )
      );
    }

    if (contentTypeFilter) {
      // @ts-ignore
      filtered = filtered.filter((rec) => rec.content_type === contentTypeFilter);
    }

    if (frequencyFilter) {
      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.patient_types.some((pt: any) => pt.frequency === frequencyFilter)
      );
    }

    if (searchTerm) {

      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredRecommendations(filtered);
  }, [
    searchTerm,
    patientTypeFilter,
    coreSupportFilter,
    contentTypeFilter,
    frequencyFilter,
    recommendations,
  ]);

  if (loading) {
    return <div>Loading...</div>;
  }


  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />

      <Container className="main-content mt-4">
        <WelcomeArea user={'Therapist'} />

        {/* View Toggle Buttons */}
        <div className="d-flex justify-content-start mb-4">
          <Button
            variant={view === 'patients' ? 'primary' : 'outline-primary'}
            onClick={() => handleViewChange('patients')}
            className="me-2"
          >
            {t('Patients')}
          </Button>
          <Button
            variant={view === 'recommendations' ? 'secondary' : 'outline-secondary'}
            onClick={() => handleViewChange('recommendations')}
          >
            {t('Recommendations')}
          </Button>
        </div>

        {/* Search and Filter Options */}
        <Row className="mb-3">
          <Col xs={12} sm={6} md={4} lg={3}>
            <Form.Group controlId="searchInput">
              <Form.Control
                type="text"
                placeholder={view === 'patients' ? t('Search Patients') : t('Search Recommendations')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Form.Group>
          </Col>

          {/* Patient Gender Filter */}
          {view === 'patients' && (
            <Col xs={12} sm={6} md={4} lg={3}>
              <Form.Group controlId="genderFilter">
                <Form.Select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                >
                  <option value="">{t('Filter by Gender')}</option>
                  {config.patientInfo.sex.map((gender) => (
                    <option key={gender} value={gender}>{gender}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
          )}

          {/* Patient Duration Filter */}
          {view === 'patients' && (
            <Col xs={12} sm={6} md={4} lg={3}>
              <Form.Group controlId="durationFilter">
                <Form.Select
                  value={durationFilter}
                  onChange={(e) => setDurationFilter(e.target.value)}
                >
                  <option value="">{t('Filter by Duration')}</option>
                  {durationOptions.map((duration) => (
                    <option key={duration} value={duration}>{duration}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
          )}

          {/* Recommendation Filters */}
          {view === 'recommendations' && (
            <>
              {/* Patient Type Filter */}
              <Col xs={12} sm={6} md={4} lg={3}>
                <Form.Group controlId="patientTypeFilter">
                  <Form.Select
                    value={patientTypeFilter}
                    onChange={(e) => setPatientTypeFilter(e.target.value)}
                  >
                    <option value="">{t('Filter by Patient Type')}</option>
                    {config.patientInfo.function.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              {/* Core/Supportive Filter */}
              <Col xs={12} sm={6} md={4} lg={3}>
                <Form.Group controlId="coreSupportFilter">
                  <Form.Select
                    value={coreSupportFilter}
                    onChange={(e) => setCoreSupportFilter(e.target.value)}
                  >
                    <option value="">{t('Filter by Core/Supportive')}</option>
                    {
                      config.RecomendationInfo.intensity.map((option :any) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              {/* Content Type Filter */}
              <Col xs={12} sm={6} md={4} lg={3}>
                <Form.Group controlId="contentTypeFilter">
                  <Form.Select
                    value={contentTypeFilter}
                    onChange={(e) => setContentTypeFilter(e.target.value)}
                  >
                    <option value="">{t('Filter by Content Type')}</option>
                    {config.RecomendationInfo.types.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              {/* Frequency Filter */}
              <Col xs={12} sm={6} md={4} lg={3}>
                <Form.Group controlId="frequencyFilter">
                  <Form.Select
                    value={frequencyFilter}
                    onChange={(e) => setFrequencyFilter(e.target.value)}
                  >
                    <option value="">{t('Filter by Frequency')}</option>
                    {config.RecomendationInfo.frequency.map((frequency) => (
                      <option key={frequency} value={frequency}>{frequency}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </>
          )}
        </Row>

        {/* Display Patients or Recommendations List */}
        <Row>
          <Col md={8}>
            {view === 'patients' && (
              <ListGroup>
                {filteredPatients.map((patient) => (
                  <ListGroup.Item
                    key={patient['_id']['$oid']}
                    action
                    onClick={() => handleItemClick(patient)}
                  >
                    {patient['name']}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}

            {view === 'recommendations' && (
              <ListGroup>
                {filteredRecommendations.map((recommendation) => (
                  <ListGroup.Item
                    key={recommendation['_id']}
                    action
                    onClick={() => handleItemClick(recommendation)}
                  >
                    {recommendation['title']}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Col>
        </Row>
      </Container>

      {/* Popup for Patient or Recommendation */}
      {selectedItem && view === 'patients' && (
        <PatientPopup
          patient={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
        />
      )}
      {selectedItem && view === 'recommendations' && (
        <ProductPopup
          item={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
          therapist={authStore.id}
        />
      )}

      <Footer />
    </div>
  );
};

export default Therapist;
