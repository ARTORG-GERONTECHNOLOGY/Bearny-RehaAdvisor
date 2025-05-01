import React, { useEffect, useState, useCallback } from 'react';
import { Button, Col, Container, Form, Row, Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import PatientPopup from '../components/TherapistPatientPage/PatientPopup';
import AddPatientPopup from '../components/AddPatient/AddPatientPopUp';

import apiClient from '../api/client';
import authStore from '../stores/authStore';
import config from '../config/config.json';

import { PatientType } from '../types/index';

const Therapist: React.FC = () => {
  const [patients, setPatients] = useState<PatientType[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientType[]>([]);
  const [selectedItem, setSelectedItem] = useState<PatientType | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showPopupAdd, setShowPopupAdd] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [durationFilter, setDurationFilter] = useState('');

  const navigate = useNavigate();
  const { t } = useTranslation();

  const durationOptions = config.RehaInfo;

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    } else {
      fetchPatients();
    }
  }, [navigate]);

  const fetchPatients = async () => {
    try {
      const res = await apiClient.get<PatientType[]>(`therapists/${authStore.id}/patients`);
      setPatients(res.data);
      setFilteredPatients(res.data);
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const handleOpen = () => setShowPopupAdd(true);

  const handleClose = useCallback(() => {
    fetchPatients();
    setShowPopupAdd(false);
  }, []);

  const handleItemClick = (patient: PatientType) => {
    setSelectedItem(patient);
    setShowPopup(true);
  };

  const handleRehabButton = (id: string, name: string) => {
    localStorage.setItem('selectedPatient', id);
    localStorage.setItem('selectedPatientName', name);
    navigate('/rehabtable');
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedItem(null);
  };

  useEffect(() => {
    let filtered = [...patients];

    if (genderFilter) {
      filtered = filtered.filter((p) => p.sex === genderFilter);
    }

    if (durationFilter) {
      filtered = filtered.filter((p) => {
        const d = p.duration;
        if (durationFilter === '< 30 days') return d < 30;
        if (durationFilter === '30-60 days') return d >= 30 && d <= 60;
        if (durationFilter === '60-90 days') return d > 60 && d <= 90;
        return d > 90;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter((p) => {
        const fullName = `${p.name} ${p.first_name}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
      });
    }

    setFilteredPatients(filtered);
  }, [searchTerm, genderFilter, durationFilter, patients]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <Container className="main-content mt-4">
        <WelcomeArea user="Therapist" />

        <Row className="mb-3">
          <Col>
            <Button onClick={handleOpen}>{t('Add a New Patient')}</Button>
          </Col>
        </Row>

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
              <Form.Label className="visually-hidden">{t('Filter by Gender')}</Form.Label>
              <Form.Select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                <option value="">{t('Filter by Gender')}</option>
                {config.patientInfo.sex.map((gender: string) => (
                  <option key={gender} value={gender}>
                    {t(gender)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>

          <Col xs={12} sm={6} md={4} lg={3}>
            <Form.Group controlId="durationFilter">
              <Form.Label className="visually-hidden">{t('Filter by Duration')}</Form.Label>
              <Form.Select
                value={durationFilter}
                onChange={(e) => setDurationFilter(e.target.value)}
              >
                <option value="">{t('Filter by Duration')}</option>
                {durationOptions.map((duration: string) => (
                  <option key={duration} value={duration}>
                    {t(duration)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        <div
          className="table-responsive shadow-sm p-3 mb-5 bg-white rounded"
          style={{ maxHeight: '400px' }}
        >
          <Table bordered hover className="table-striped">
            <thead
              className="table-striped"
              style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'white' }}
            >
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
                <tr key={patient._id}>
                  <td>
                    {patient.first_name} {patient.name}
                    <Button
                      variant="primary"
                      onClick={() => handleItemClick(patient)}
                      className="ms-3 py-1 px-2"
                    >
                      {t('Info')}
                    </Button>
                  </td>
                  <td>{new Date(patient.age).getFullYear()}</td>
                  <td>{t(patient.diagnosis)}</td>
                  <td>{t(patient.sex)}</td>
                  <td>
                    <Button
                      variant="primary"
                      onClick={() =>
                        handleRehabButton(patient._id, `${patient.first_name} ${patient.name}`)
                      }
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
        <PatientPopup patient_id={selectedItem} show={showPopup} handleClose={handleClosePopup} />
      )}

      <AddPatientPopup show={showPopupAdd} handleClose={handleClose} />

      <Footer />
    </div>
  );
};

export default Therapist;
