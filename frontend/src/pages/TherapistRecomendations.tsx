import React, { useEffect, useState } from 'react';
import { Badge, Button, Col, Container, Form, ListGroup, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import WelcomeArea from '../components/WelcomeArea';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import ProductPopup from '../components/ProductPopup';
import config from '../config/config.json';
import AddRecommendationPopup from '../components/forms/AddRecomendationPopUp';

const TherapistRecomendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [coreSupportFilter, setCoreSupportFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPopupAdd, setShowPopupAdd] = useState(false);
  // @ts-ignore
  const diagnoses = config?.patientInfo?.function?.[authStore?.specialisation]?.diagnosis || [];
  const handleOpen = () => setShowPopupAdd(true);
  const handleClose = () => setShowPopupAdd(false);

  const therapistId = authStore.id;

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
      
      fetchData();
    }
  }, [therapistId]);

  const fetchData = async () => {
    try {
      const recommendationResponse = await apiClient.get('recommendations/all/');
      setRecommendations(recommendationResponse.data);
      setFilteredRecommendations(recommendationResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedItem(null);
  };

  const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      // Helper function to check if a URL contains a domain
      const isDomain = (url: string, domain: string) => url.includes(domain);
      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'primary';
      if (isDomain(link, 'vimeo.com')) return 'primary';

      return 'warning'; // Link
    }

    if (mediaUrl.endsWith('.mp4')) return 'primary';
    if (mediaUrl.endsWith('.mp3')) return 'info';
    if (mediaUrl.endsWith('.pdf')) return 'danger';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'success';


    return 'secondary'; // Default for unknown file types
  };

  const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
    if (!mediaUrl) {
      // Helper function to check if a URL contains a domain
      const isDomain = (url: string, domain: string) => url.includes(domain);

      // Check for iframe-compatible links (e.g., YouTube, Vimeo)
      if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'Video';
      if (isDomain(link, 'vimeo.com')) return 'Video';

      return 'Link';
    }

    if (mediaUrl.endsWith('.mp4')) return 'Video';
    if (mediaUrl.endsWith('.mp3')) return 'Audio';
    if (mediaUrl.endsWith('.pdf')) return 'PDF';
    if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png')) return 'Image';

    return 'Unknown';
  };

  // Filter recommendations based on selected filters and search term
  useEffect(() => {
    let filtered = recommendations;

    if (patientTypeFilter) {
      filtered = filtered.filter((rec) =>
        // Check if `rec.patient_types` contains a matching patient type or diagnosis
        rec.patient_types.some((pt) => {
          const matchesType = patientTypeFilter ? pt.diagnosis === patientTypeFilter : true;
          return matchesType;
        })
      );
    }

    if (coreSupportFilter) {
      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.patient_types.some((pt: any) =>
          // @ts-ignore
          coreSupportFilter === 'Core' ? pt.include_option : !pt.include_option,
        ),
      );
    }

    if (contentTypeFilter) {
      // @ts-ignore
      filtered = filtered.filter((rec) => rec.content_type === contentTypeFilter);
    }

    if (frequencyFilter) {
      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.patient_types.some((pt: any) => pt.frequency === frequencyFilter),
      );
    }

    if (searchTerm) {

      filtered = filtered.filter((rec) =>
        // @ts-ignore
        rec.title.toLowerCase().includes(searchTerm.toLowerCase()),
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
        <WelcomeArea user={'TherapistPatients'} />
        <Button onClick={handleOpen}>Add Recommendation</Button>
        {/* Search and Filter Options */}
        <Row className="mb-3">
          <Col xs={12} sm={6} md={4} lg={3}>
            <Form.Group controlId="searchInput">
              <Form.Control
                type="text"
                placeholder={t('Search Recommendations')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Form.Group>
          </Col>

          {/* Recommendation Filters */}
          {/* Patient Type Filter */}
          <Col xs={12} sm={6} md={4} lg={3}>
            <Form.Group controlId="patientTypeFilter">
              <Form.Select
                value={patientTypeFilter}
                onChange={(e) => setPatientTypeFilter(e.target.value)}
              >
                <option value="">{t('Filter by Patient Type')}</option>
                {diagnoses.map((type: string) => (
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
                  config.RecomendationInfo.intensity.map((option: any) => (
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
        </Row>

        {/* Display Recommendations List */}
        <Row>
          <Col md={8}>
            <ListGroup className="shadow-sm">
              {filteredRecommendations.map((recommendation) => (
                <ListGroup.Item
                  key={recommendation['_id']}
                  action
                  onClick={() => handleItemClick(recommendation)}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <strong>{recommendation['title']}</strong>
                    <div className="text-muted">
                      {  // @ts-ignore
                        recommendation['content_type'].charAt(0).toUpperCase() + recommendation['content_type'].slice(1)}
                    </div>
                  </div>

                  <Badge bg={getBadgeVariantFromUrl(recommendation['media_url'], recommendation['link'])}>
                    {getMediaTypeLabelFromUrl(recommendation['media_url'], recommendation['link'])}
                  </Badge>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>
        </Row>
      </Container>

      {selectedItem && (
        <ProductPopup
          item={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
          therapist={authStore.id}
        />
      )}
      <AddRecommendationPopup show={showPopupAdd} handleClose={handleClose} onSuccess={() => fetchData()} />
      <Footer />
    </div>
  );
};

export default TherapistRecomendations;
