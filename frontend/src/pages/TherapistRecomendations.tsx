import React, { useEffect, useState } from 'react';
import { Badge, Button, Col, Container, Form, ListGroup, Row, Card } from 'react-bootstrap';
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
import Select from 'react-select';



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
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);
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

  // Function to generate color spectrum based on available tags
  const generateTagColors = (tags: string[]) => {
    const tagColors: Record<string, string> = {};

    tags.forEach((tag, index) => {
      const hue = (index * 360) / tags.length; // Spread colors evenly in HSL spectrum
      tagColors[tag] = `hsl(${hue}, 70%, 50%)`; // Generate HSL color
    });

    return tagColors;
  };
  // Generate colors dynamically
  const tagColors = generateTagColors(config.RecomendationInfo.tags);


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

    if (tagFilter.length > 0) {
      // @ts-ignore
      filtered = filtered.filter((rec) =>
        rec.tags.some((tag) => tagFilter.includes(tag))
      );
    }

    if (benefitForFilter.length > 0) {
      // @ts-ignore
      filtered = filtered.filter((rec) =>
        rec.benefitFor.some((benefit) => benefitForFilter.includes(benefit))
      );
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
    benefitForFilter,
    tagFilter,
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
        {/* Welcome Section */}
        <WelcomeArea user={'TherapistPatients'} />
        

        <Row className="justify-content-center mb-3">
          <Col xs={12} md={9} className="mx-auto">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">
              {/* Add Recommendation Button (Left-Aligned on Large Screens) */}
              <Button onClick={handleOpen} className="btn-primary w-100 w-md-auto">
                {t('Add Recommendation')}
              </Button>

              {/* Search Input (Right-Aligned on Large Screens) */}
              <Form.Group controlId="searchInput" className="w-100 w-md-auto">
                <Form.Control
                  type="text"
                  placeholder={t('Search Recommendations')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ minWidth: '250px' }} // Prevents shrinking too much
                />
              </Form.Group>
            </div>
          </Col>
        </Row>

        {/* Filters & Recommendations Section (Centered & Same Width) */}
        <Row className="justify-content-center">
          <Col md={9} className="mx-auto">
            {/* Filters Card (Same Width as List) */}
            <Card className="p-3 shadow-sm w-100">
              <Row className="g-3">
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
                      {config.RecomendationInfo.intensity.map((option: any) => (
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

                {/* Tag Filter */}
                <Col xs={12} sm={6} md={4} lg={3}>
                  <Form.Group controlId="tagFilter">
                    <Select
                      isMulti
                      options={config.RecomendationInfo.tags.map((tag) => ({
                        value: tag,
                        label: tag,
                      }))}
                      value={tagFilter.map(tag => ({ value: tag, label: tag }))}
                      onChange={(selectedOptions) =>
                        setTagFilter(selectedOptions.map(option => option.value))
                      }
                      placeholder={t('Filter by Tags')}
                    />
                  </Form.Group>
                </Col>

                {/* Benefit for Filter */}
                <Col xs={12} sm={6} md={4} lg={3}>
                  <Form.Group controlId="benefitFor">
                    <Select
                      isMulti
                      options={config.RecomendationInfo.benefits.map((benefitFor) => ({
                        value: benefitFor,
                        label: benefitFor,
                      }))}
                      value={benefitForFilter.map(benefitFor => ({ value: benefitFor, label: benefitFor }))}
                      onChange={(selectedOptions) =>
                        setBenefitForFilter(selectedOptions.map(option => option.value))
                      }
                      placeholder={t('Filter by Benefit')}
                    />
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
            </Card>

            {/* Display Recommendations List (Same Width as Filters Card) */}
            <ListGroup className="shadow-sm w-100 mt-4">
              {filteredRecommendations.map((recommendation) => (
                <ListGroup.Item
                  key={recommendation['_id']}
                  action
                  onClick={() => handleItemClick(recommendation)}
                  className="d-flex justify-content-between align-items-center flex-wrap"
                >
                  {/* Left Section: Title, Content Type, and Tags */}
                  <div className="d-flex flex-column">
                    <strong>{recommendation['title']}</strong>
                    <div className="text-muted">
                      {recommendation['content_type'].charAt(0).toUpperCase() + recommendation['content_type'].slice(1)}
                    </div>

                    {/* Display tags neatly if they exist */}
                    {recommendation.tags?.length > 0 && (
                      <div className="mt-2 d-flex flex-wrap gap-1">
                        {recommendation.tags.map((tag) => (
                          <Badge key={tag} bg='' style={{ backgroundColor: tagColors[tag] || 'grey', color: 'white' }} className="me-1">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Section: Media Type Badge */}
                  <div>
                    <Badge bg={getBadgeVariantFromUrl(recommendation['media_url'], recommendation['link'])}>
                      {getMediaTypeLabelFromUrl(recommendation['media_url'], recommendation['link'])}
                    </Badge>
                  </div>
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
          tagColors={tagColors}
        />
      )}
      <AddRecommendationPopup show={showPopupAdd} handleClose={handleClose} onSuccess={() => fetchData()} />
      <Footer />
    </div>
  );
};

export default TherapistRecomendations;
