import React, { useEffect, useState } from 'react';
import {
  Col,
  ListGroup,
  Modal,
  Row,
  Badge,
  Button,
  Form,
  Container,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { Document, Page } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import apiClient from '../../api/client';
import config from '../../config/config.json';
import authStore from '../../stores/authStore';
import InterventionRepeatModal from '../RehaTablePage/InterventionRepeatModal';
import ErrorAlert from '../common/ErrorAlert';
import { getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { translateText } from '../../utils/translate';

const ProductPopup = ({ show, item, handleClose, tagColors }) => {
  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');
  const [selectedDiagnoses, setSelectedDiagnoses] = useState([]);
  const [selectedAll, setSelectedAll] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [selectedDiagnose, setSelectedDiagnose] = useState('');
  const [selectedIntervention, setSelectedIntervention] = useState('');
  const [newRows, setNewRows] = useState([{ specialisation: '', diagnosis: '', frequency: '', saved: false }]);
  const [error, setError] = useState('');

  const specialisations = authStore.specialisation?.split(',').map((s) => s.trim()) || [];
  const diagnoses = specialisations.flatMap(spec => config?.patientInfo?.function?.[spec]?.diagnosis || []);

  useEffect(() => {
    const translate = async () => {
      if (item?.description) {
        const { translatedText, detectedSourceLanguage } = await translateText(item.description);
        setTranslatedText(translatedText);
        setDetectedLang(translatedText !== item.description ? detectedSourceLanguage : '');
      }
      if (item?.title) {
        const { translatedText: tTitle, detectedSourceLanguage: tLang } = await translateText(item.title);
        setTranslatedTitle(tTitle);
        setTitleLang(tTitle !== item.title ? tLang : '');
      }
    };
    if (show) translate();
  }, [item, show]);

  const renderMediaContent = () => {
    const type = getMediaTypeLabelFromUrl(item.media_file, item.link);
    switch (type) {
      case 'Video':
        return <ReactPlayer url={item.media_file || item.link} width="100%" height="auto" controls />;
      case 'Audio':
        return <ReactAudioPlayer src={item.media_file || item.link} controls />;
      case 'PDF':
        return (
          <div>
            <Document file={item.media_url}>
              <Page pageNumber={1} width={300} />
            </Document>
            <a href={item.media_file} className="btn btn-outline-primary mt-2" target="_blank" rel="noreferrer">
              Open PDF
            </a>
          </div>
        );
      case 'Image':
        return <img src={item.media_file} alt="Intervention media" className="img-fluid rounded" />;
      case 'Link':
        return <Microlink url={item.link} style={{ width: '100%' }} />;
      default:
        return (
          <a href={item.media_file || item.link} className="btn btn-secondary" target="_blank" rel="noreferrer">
            Open Resource
          </a>
        );
    }
  };

  const updateRow = (idx, field, val) => {
    setNewRows(prev => {
      const copy = [...prev];
      copy[idx][field] = val;
      return copy;
    });
  };

  const saveRow = async (idx) => {
    const row = newRows[idx];
    if (!row.specialisation || !row.diagnosis || !row.frequency) return;
    try {
      await apiClient.post('/recomendation/add/patientgroup/', {
        interventionId: item._id,
        therapistId: authStore.id,
        speciality: row.specialisation,
        diagnosis: row.diagnosis,
        frequency: row.frequency,
      });
      setNewRows(prev => {
        const copy = [...prev];
        copy[idx].saved = true;
        return copy;
      });
    } catch (e) {
      setError('Failed to save row. Please try again.');
    }
  };

  const handleCheckboxChange = async (diagnosis) => {
    const isChecked = selectedDiagnoses.includes(diagnosis);
    if (isChecked) {
      setSelectedDiagnoses((prev) => prev.filter((d) => d !== diagnosis));
      await apiClient.post('interventions/remove-from-patient-types/', {
        diagnosis,
        intervention_id: item._id,
        therapist: authStore.id,
      });
    } else {
      setSelectedDiagnose(diagnosis);
      setSelectedIntervention(item._id);
      setShowScheduler(true);
    }
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title as="h2">
            {titleLang ? (
              <OverlayTrigger
                overlay={<Tooltip>{item.title}</Tooltip>}
              >
                <span>{translatedTitle}</span>
              </OverlayTrigger>
            ) : (
              item.title
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <ErrorAlert message={error} onClose={() => setError('')} />}

          <Container fluid>
            <Row className="mb-3">
              <Col xs={12} md={6}>
                <h5>Description</h5>
                <p className="text-muted">
                  {detectedLang ? (
                    <OverlayTrigger overlay={<Tooltip>{item.description}</Tooltip>}>
                      <span>{translatedText}</span>
                    </OverlayTrigger>
                  ) : (
                    item.description
                  )}
                </p>
              </Col>

              <Col xs={12} md={6}>
                <h5>Media</h5>
                {renderMediaContent()}
              </Col>
            </Row>

            <Row className="mb-3">
              <Col>
                <h5>Tags & Benefits</h5>
                {item.tags?.map((tag) => (
                  <Badge
                    key={tag}
                    className="me-2 mb-1"
                    style={{ backgroundColor: tagColors[tag] || '#888', color: '#fff' }}
                    role="status"
                  >
                    {tag}
                  </Badge>
                ))}
                {item.benefitFor?.map((b) => (
                  <Badge key={b} className="me-2 mb-1 bg-info text-dark">{b}</Badge>
                ))}
              </Col>
            </Row>

            <Row className="mb-3">
              <Col>
                <h5>Assign to Diagnoses</h5>
                <div style={{ maxHeight: 200, overflowY: 'auto' }} aria-label="Diagnoses list">
                  <Form.Check
                    type="checkbox"
                    label="All"
                    checked={selectedAll}
                    onChange={() => setSelectedAll(!selectedAll)}
                    aria-checked={selectedAll}
                  />
                  {!selectedAll &&
                    diagnoses.map((d) => (
                      <Form.Check
                        key={d}
                        type="checkbox"
                        label={d}
                        checked={selectedDiagnoses.includes(d)}
                        onChange={() => handleCheckboxChange(d)}
                        aria-checked={selectedDiagnoses.includes(d)}
                      />
                    ))}
                </div>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col>
                <h5>Assign to Additional</h5>
                {newRows.map((row, idx) => {
                  const diagOptions = row.specialisation
                    ? config?.patientInfo?.function?.[row.specialisation]?.diagnosis || []
                    : [];

                  return (
                    <Row key={idx} className="g-2 align-items-center mb-2">
                      <Col xs={12} md={4}>
                        <Form.Select
                          value={row.specialisation}
                          onChange={(e) => updateRow(idx, 'specialisation', e.target.value)}
                          disabled={row.saved}
                          aria-label="Specialisation select"
                        >
                          <option value="">Select Specialisation</option>
                          {specialisations.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col xs={12} md={4}>
                        <Form.Select
                          value={row.diagnosis}
                          onChange={(e) => updateRow(idx, 'diagnosis', e.target.value)}
                          disabled={row.saved}
                          aria-label="Diagnosis select"
                        >
                          <option value="">Select Diagnosis</option>
                          {diagOptions.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col xs={12} md={3}>
                        <Form.Select
                          value={row.frequency}
                          onChange={(e) => updateRow(idx, 'frequency', e.target.value)}
                          disabled={row.saved}
                          aria-label="Frequency select"
                        >
                          <option value="">Select Frequency</option>
                          {config?.RecomendationInfo?.frequency.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col xs={12} md={1} className="d-flex justify-content-end">
                        {!row.saved && (
                          <Button variant="success" onClick={() => saveRow(idx)} aria-label="Save assignment">
                            ✓
                          </Button>
                        )}
                      </Col>
                    </Row>
                  );
                })}
              </Col>
            </Row>
          </Container>
        </Modal.Body>
      </Modal>

      {showScheduler && (
        <InterventionRepeatModal
          show={true}
          onHide={() => setShowScheduler(false)}
          patient={selectedDiagnose}
          intervention={selectedIntervention}
        />
      )}
    </>
  );
};

export default ProductPopup;
