import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Form, Row, Table } from 'react-bootstrap';
import PatientPopup from '../components/PatientPopup';
import { useTranslation } from 'react-i18next';
import WelcomeArea from '../components/WelcomeArea';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import config from '../config/config.json';
import AddPatientPopup from '../components/forms/AddPatientPopUp';

const Therapist: React.FC = () => {
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [durationFilter, setDurationFilter] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPopupAdd, setShowPopupAdd] = useState(false);

  const handleOpen = () => setShowPopupAdd(true);
  const handleClose = () => setShowPopupAdd(false);


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
          const patientData = patientResponse.data;
          setPatients(patientData);
          setFilteredPatients(patientData);
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
  const handleRehabButton = (item: any) => {
    localStorage.setItem('selectedPatient', item.username);
    navigate(`/rehabtable`);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedItem(null);
  };

  // Filter patients based on gender, duration, and search term
  useEffect(() => {
    let filtered = patients;

    if (genderFilter) {
      filtered = filtered.filter((patient) => patient['sex'] === genderFilter);
    }

    if (durationFilter) {
      filtered = filtered.filter((patient) => {
        const duration = patient['duration'];
        if (durationFilter === '< 30 days') return duration < 30;
        if (durationFilter === '30-60 days') return duration >= 30 && duration <= 60;
        if (durationFilter === '60-90 days') return duration > 60 && duration <= 90;
        return duration > 90;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter((patient) => {
        // @ts-ignore
        const fullName = `${patient.name} ${patient.first_name}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
      });
    }


    setFilteredPatients(filtered);
  }, [genderFilter, durationFilter, searchTerm, patients]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />

      <Container className="main-content mt-4">
        <WelcomeArea user={'Therapist'} />
        <Button onClick={handleOpen}>Add New Patient</Button>

        {/* Search and Filter Options */}
        <Row className="mb-3">
          <Col xs={12} sm={6} md={4} lg={3}>
            <Form.Group controlId="searchInput">
              <Form.Control
                type="text"
                placeholder={t('Search Patients')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Form.Group>
          </Col>

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
        </Row>

        {/* Tabular Display of Patients */}
        <div className="table-responsive shadow-sm p-3 mb-5 bg-white rounded" style={{ maxHeight: '400px' }}>
          <Table bordered hover className="table-striped">
            <thead className="table-striped"
                   style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'white' }}>
            <tr>
              <th>{t('Full Name')}</th>
              <th>{t('Birth Year')}</th>
              <th>{t('Type')}</th>
              <th>{t('Gender')}</th>
              <th>{t('Actions')}</th>
            </tr>
            </thead>
            <tbody>
            {filteredPatients.map((patient) => (
              <tr key={patient['_id']}>
                <td>{patient['first_name']} {patient['name']}
                  <Button
                    variant="primary"
                    onClick={() => handleItemClick(patient)}
                    style={{ padding: 5, marginLeft: '20px' }}
                  >
                    {t('Info')}
                  </Button></td>
                <td>{new Date(patient['age']).getFullYear()}</td>
                <td>{patient['diagnosis']}</td>
                <td>{patient['sex']}</td>
                <td>
                  <Button
                    variant="primary"
                    onClick={() => handleRehabButton(patient)}
                  >
                    {t('Go to Rehab Table')}
                  </Button>

                </td>
              </tr>
            ))}
            </tbody>
          </Table>
        </div>
      </Container>

      {selectedItem && (
        <PatientPopup
          patient={selectedItem} // This will be null when no patient is selected
          show={showPopup}
          handleClose={handleClosePopup}
        />)}
      <AddPatientPopup show={showPopupAdd} handleClose={handleClose} />


      <Footer />
    </div>
  );
};

export default Therapist;
