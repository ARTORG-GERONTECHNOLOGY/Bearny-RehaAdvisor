// src/pages/Therapist.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Button,
  Col,
  Container,
  Form,
  Row,
  Card,
  Table,
  Collapse,
  Badge,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import ErrorAlert from '../components/common/ErrorAlert';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import PatientPopup from '../components/TherapistPatientPage/PatientPopup';
import AddPatientPopup from '../components/AddPatient/AddPatientPopUp';

import apiClient from '../api/client';
import authStore from '../stores/authStore';
import config from '../config/config.json';

import { PatientType } from '../types';

const Therapist: React.FC = () => {
  const [patients, setPatients] = useState<PatientType[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientType[]>([]);
  const [selectedItem, setSelectedItem] = useState<PatientType | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showPopupAdd, setShowPopupAdd] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sexFilter, setSexFilter] = useState('');
  const [durationFilter, setDurationFilter] = useState('');
  const [birthdateFilter, setBirthdateFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);        // NEW — toggle for completed section

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

  const sortByCreatedDesc = (list: PatientType[]) =>
    [...list].sort((a, b) => {
      const da = new Date((a as any).created_at ?? 0).getTime();
      const db = new Date((b as any).created_at ?? 0).getTime();
      return db - da; // newest first
    });

  const fetchPatients = async () => {
    try {
      const res = await apiClient.get<PatientType[]>(`therapists/${authStore.id}/patients`);
      const sorted = sortByCreatedDesc(res.data || []);
      setPatients(sorted);
      setFilteredPatients(sorted);
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError(t('Failed to fetch patients. Please try again later.'));
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

  const handleProgressButton = (id: string, name: string) => {
    localStorage.setItem('selectedPatient', id);
    localStorage.setItem('selectedPatientName', name);
    navigate('/health');
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setSelectedItem(null);
  };

  // Reset filters — keeps default "Active only" view intact
  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSexFilter('');
    setDurationFilter('');
    setBirthdateFilter('');
  }, []);

  // helpers for display
  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso; // fallback to raw
    return d.toLocaleDateString();
  };

  // Decide if a patient is completed: backend can send rehab_status = 'completed' and/or rehab_end_date
  const isCompletedPatient = (p: PatientType) => {
    const status = (p as any).rehab_status;
    const end = (p as any).rehab_end_date;
    return status === 'completed' || !!end;
  };

  useEffect(() => {
    let filtered = [...patients];

    if (sexFilter) {
      filtered = filtered.filter((p) => p.sex === sexFilter);
    }

    if (durationFilter) {
      filtered = filtered.filter((p) => {
        const d = (p as any).duration as number;
        if (durationFilter === '< 30 days') return d < 30;
        if (durationFilter === '30-60 days') return d >= 30 && d <= 60;
        if (durationFilter === '60-90 days') return d > 60 && d <= 90;
        return d > 90;
      });
    }

    // Name search (full name or any part, either order). Allow username/id too.
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p) => {
        const first = (p.first_name || '').toLowerCase();
        const last = (p.name || '').toLowerCase();
        const full1 = `${first} ${last}`.trim();
        const full2 = `${last} ${first}`.trim();
        const username = (p as any).username ? String((p as any).username).toLowerCase() : '';
        const pid = String((p as any)._id || '').toLowerCase();
        return (
          first.includes(term) ||
          last.includes(term) ||
          full1.includes(term) ||
          full2.includes(term) ||
          username.includes(term) ||
          pid.includes(term)
        );
      });
    }

    // Birth date filter — exact yyyy-mm-dd match
    if (birthdateFilter) {
      filtered = filtered.filter((p) => String((p as any).age).slice(0, 10) === birthdateFilter);
    }

    setFilteredPatients(sortByCreatedDesc(filtered));
  }, [searchTerm, sexFilter, durationFilter, birthdateFilter, patients]);

  // Split into Active and Completed lists (Active shown by default)
  const activePatients = filteredPatients.filter((p) => !isCompletedPatient(p));
  const completedPatients = filteredPatients
    .filter((p) => isCompletedPatient(p))
    .sort((a, b) => {
      // newest end date first; fallback to created_at
      const ea = new Date((a as any).rehab_end_date ?? (a as any).created_at ?? 0).getTime();
      const eb = new Date((b as any).rehab_end_date ?? (b as any).created_at ?? 0).getTime();
      return eb - ea;
    });

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container className="main-content mt-4">
        <WelcomeArea user="Therapist" />
        <Row>
          <Col>
            {error && <ErrorAlert message={error} onClose={() => setError('')} />}
          </Col>
        </Row>

        <Row className="mb-3">
          <Col>
            <Button onClick={handleOpen}>{t('Add a New Patient')}</Button>
          </Col>
        </Row>

        {/* Filters */}
        <Card className="mb-3">
          <Card.Body>
            <Row className="g-3">
              <Col xs={12} md={3}>
                <Form.Control
                  type="text"
                  placeholder={t('Search by name, ID or username')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </Col>
              <Col xs={12} md={3}>
                <Form.Control
                  type="date"
                  value={birthdateFilter}
                  onChange={(e) => setBirthdateFilter(e.target.value)}
                  aria-label={t('Filter by Birth Date')}
                />
              </Col>
              <Col xs={12} md={3}>
                <Form.Select
                  value={sexFilter}
                  onChange={(e) => setSexFilter(e.target.value)}
                >
                  <option value="">{t('Filter by Sex')}</option>
                  {config.patientInfo.sex.map((sex: string) => (
                    <option key={sex} value={sex}>
                      {t(sex)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={12} md={3}>
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
              </Col>
            </Row>

            {/* Controls: reset + show completed */}
            <Row className="mt-3 align-items-center">
              <Col className="d-flex flex-wrap gap-3 justify-content-end">
                <Form.Check
                  type="switch"
                  id="toggle-completed"
                  label={t('Show completed')}
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.currentTarget.checked)}
                />
                <Button variant="outline-secondary" onClick={resetFilters}>
                  {t('Reset filters')}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Active Patients (default, counts unaffected by completed) */}
        <h5 className="mb-2">
          {t('Active patients')} ({activePatients.length})
        </h5>
        <Table responsive hover className="align-middle">
          <thead>
            <tr>
              <th>{t('Full Name')}</th>
              <th>{t('Birth Date')}</th>
              <th>{t('Sex')}</th>
              <th>{t('Diagnosis')}</th>
              <th className="text-end">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {activePatients.map((p) => {
              const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
              const diagnosis = Array.isArray(p.diagnosis)
                ? p.diagnosis.join(', ')
                : String(p.diagnosis || '');
              return (
                <tr key={(p as any)._id}>
                  <td>{fullName}</td>
                  <td>{fmtDate(String((p as any).age))}</td>
                  <td>{t(p.sex)}</td>
                  <td style={{ minWidth: 200 }}>{diagnosis}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleItemClick(p)}
                      >
                        {t('Info')}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleRehabButton((p as any)._id as any, fullName)}
                      >
                        {t('Rehabilitation Plan')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => handleProgressButton((p as any)._id as any, fullName)}
                      >
                        {t('Outcomes Dashboard')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {activePatients.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  {t('No active patients')}
                </td>
              </tr>
            )}
          </tbody>
        </Table>

        {/* Completed Patients (collapsible, below the active list) */}
        <Collapse in={showCompleted}>
          <div>
            <h5 className="mt-4 mb-2">
              {t('Completed')} ({completedPatients.length})
            </h5>
            <Table responsive hover className="align-middle">
              <thead>
                <tr>
                  <th>{t('Full Name')}</th>
                  <th>{t('Birth Date')}</th>
                  <th>{t('Sex')}</th>
                  <th>{t('Diagnosis')}</th>
                  <th className="text-end">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {completedPatients.map((p) => {
                  const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
                  const diagnosis = Array.isArray(p.diagnosis)
                    ? p.diagnosis.join(', ')
                    : String(p.diagnosis || '');
                  const endDate = (p as any).rehab_end_date;
                  return (
                    <tr key={(p as any)._id} className="completed-row">
                      <td>
                        {fullName}{' '}
                        <Badge bg="success" className="ms-2">
                          {t('Completed')}
                        </Badge>
                        {endDate && (
                          <small className="text-muted ms-2">
                            {t('Discharged')}: {fmtDate(endDate)}
                          </small>
                        )}
                      </td>
                      <td>{fmtDate(String((p as any).age))}</td>
                      <td>{t(p.sex)}</td>
                      <td style={{ minWidth: 200 }}>{diagnosis}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => handleItemClick(p)}
                          >
                            {t('Info')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleProgressButton((p as any)._id as any, fullName)}
                          >
                            {t('Outcomes Dashboard')}
                          </Button>
                          {/* Optional: Reactivate button could start a new episode */}
                          {/* <Button size="sm" variant="outline-success" onClick={() => startNewEpisodeFor((p as any)._id)}>
                            {t('Reactivate')}
                          </Button> */}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {completedPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      {t('No completed patients')}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Collapse>
      </Container>

      {selectedItem && (
        <PatientPopup
          patient_id={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
        />
      )}

      <AddPatientPopup show={showPopupAdd} handleClose={handleClose} />
      <Footer />

      <style>{`
        /* Subtle visual difference for completed rows */
        .completed-row {
          opacity: .8;
        }
        .completed-row td:first-child {
          color: #555;
        }
      `}</style>
    </div>
  );
};

export default Therapist;
