import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row, Badge, Button, Form } from 'react-bootstrap';
import apiClient from '../api/client';
import config from '../config/config.json';
import authStore from '../stores/authStore';
import { generateTagColors, getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from "react-player";
import ReactAudioPlayer from 'react-audio-player';
import InterventionRepeatModal from './InterventionRepeatModal';
import AddDiagnosisModal from './DiagnosisAssignmentForm';

interface ProductPopupProps {
  show: boolean;
  item: any;
  handleClose: () => void;
  therapist: string;
  tagColors: any;
}

const ProductPopup: React.FC<ProductPopupProps> = ({ show, item, handleClose, therapist, tagColors }) => {
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [selectedAll, setSelectedAll] = useState<boolean>(false);
  const [showScheduler, setShowScheduler] =  useState<boolean>(false);
  const [selectedIntervention, setSelectedIntervention] = useState<string>('');
  const [selectedDiagnose, setSelectedDiagnose] = useState<string>('');
  // @ts-ignore
  const specialisations = authStore.specialisation.split(',').map(s => s.trim())
  const diagnoses = Array.isArray(specialisations)
  ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
  : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];


  const [newRows, setNewRows] = useState([{ specialisation: '', diagnosis: '', frequency: '', saved: false }]);

  const addNewRow = () => {
    setNewRows([...newRows, { diagnosis: '', frequency: '', saved: false }]);
  };
  
  const updateRow = (idx, field, value) => {
    setNewRows(prev => {
      const updated = [...prev];
      updated[idx][field] = value;
      return updated;
    });
  };
  
  const saveRow = async (idx) => {
    const row = newRows[idx];
    if (!row.specialisation || !row.diagnosis || !row.frequency) return;

  
    try {
      await apiClient.post('/recomendation/add/patientgroup/', {
        interventionId: item['_id'],
        therapistId: authStore.id,
        speciality: row.specialisation,
        diagnosis: row.diagnosis,
        frequency: row.frequency,
      });
  
      setNewRows(prev => {
        const updated = [...prev];
        updated[idx].saved = true;
        return updated;
      });
    } catch (err) {
      console.error('Failed to save row:', err);
    }
  };
  

  useEffect(() => {
    if (show) {
      fetchAssignedDiagnoses();
    }
  }, [show]);

  const renderMediaContent = () => {
      if (!item.media_file && !item.link) return(<p className="text-muted">{t("No media available")}</p>);
  
      const mediaType = getMediaTypeLabelFromUrl(item.media_file, item.link);
  
      switch (mediaType) {
        case 'Video':
          return (
            <div className="rounded shadow-sm overflow-hidden">
              <ReactPlayer
                url={item.media_file || item.link}
                width="100%"
                height="400px"
                controls
              />
            </div>
          );
        case 'Audio':
          return (
            <ReactAudioPlayer
                              src={item.media_file || item.link}
                              controls
                            />
          );
        case 'PDF':
          return (
            <div className="pdf-preview">
              <Document file={item.media_url} loading={<p>{t("Loading PDF...")}</p>}>
                <Page pageNumber={1} width={300} />
              </Document>
              <a href={item.media_file} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-2">
                {t("Open PDF")}
              </a>
            </div>
          );
        case 'Image':
          return <img src={item.media_file} alt="Intervention" className="img-fluid rounded shadow" />;
      case 'Link':
          return (
              <Microlink
              url={item.link}
              style={{ width: '100%', borderRadius: '10px', marginTop: '10px' }}
              />
          );
  
            
        default:
          return (
            <a href={item.link || item.media_file} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              {t("Open Resource")}
            </a>
          );
      }
    };

  const fetchAssignedDiagnoses = async () => {
    try {
      const response = await apiClient.get(
        `interventions/${item['_id']}/assigned-diagnoses/${authStore.specialisation}/therapist/${authStore.id}`,
      );
      const assignedDiagnoses = Object.entries(response.data.diagnoses)
        .filter(([_, isAssigned]) => isAssigned)
        .map(([diagnosis]) => diagnosis);

      setSelectedDiagnoses(assignedDiagnoses);
      setSelectedAll(response.data.all);
    } catch (error) {
      console.error('Error fetching assigned diagnoses:', error);
    }
  };

  const handleCheckboxChange = async (diagnosis: string) => {
    const isChecked = selectedDiagnoses.includes(diagnosis);
    setSelectedDiagnoses((prevSelected) =>
      isChecked ? prevSelected.filter((d) => d !== diagnosis) : [...prevSelected, diagnosis],
    );
    if (isChecked) {
      try {
        await apiClient.post('interventions/remove-from-patient-types/', {
          diagnosis,
          intervention_id: item['_id'],
          therapist: authStore.id,
        });
      } catch (error) {
        console.error(`Error updating intervention for ${diagnosis}:`, error);
      }

    }
    else {
      setSelectedIntervention(item['_id'])
      setShowScheduler(true)
      setSelectedDiagnose(diagnosis)
    }

    
  };

  const handleAllCheckboxChange = async () => {
    const newSelectedAll = !selectedAll;
    setSelectedAll(newSelectedAll);
    setSelectedDiagnoses(newSelectedAll ? diagnoses : []);

    if (newSelectedAll) {
      try {
        await apiClient.post('interventions/remove-from-patient-types/', {
          diagnosis: 'all',
          intervention_id: item['_id'],
          therapist: authStore.id,
        });
      } catch (error) {
        console.error(`Error updating intervention for all`, error);
      }

    }
    else {
      setSelectedIntervention(item['_id'])
      setShowScheduler(true)
      setSelectedDiagnose('all')
    }
  };

  return (
    <>
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton className="d-flex justify-content-between align-items-center">
      <Modal.Title>
      <h2>{item.title}</h2>
      <h3 className="text-muted">{t(item.content_type)}</h3>

      {/* Beneft for Section - Directly Below Content Type */}
      {item.benefitFor?.length > 0 && (<>
        
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.benefitFor.map((benefit) => (
                <Badge
                  key={benefit}
                  style={{ color: 'white' }}
                  className="me-1"
                >
                  {t("benefit")}
                </Badge>
              ))}
            </div>
            </>
          )}

      {/* Tags Section - Directly Below Content Type */}
      {item.tags?.length > 0 && (
        <div className="mt-2 d-flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              bg=""
              style={{ backgroundColor: tagColors[tag] || 'grey', color: 'white' }}
              className="me-1"
            >
              {t(tag)}
            </Badge>
          ))}
        </div>
      )}

    
    </Modal.Title>
    </Modal.Header>
    <Modal.Body>
      {/* Existing recommended section */}
      <Row className="pb-3 mb-3 border-bottom">
        <h5>{t("Recomended to patients")}:</h5>
        {item.patient_types.map((type, idx) => (
          <Row>
            <Col>
              <p className="text-muted">{type.diagnosis} ({type.type})</p>
            </Col>
            <Col>
              <p className="text-muted">{t("Frequnecy:")} {type.frequency}</p>
            </Col>
          </Row>
        ))}
  

      {/* Add new rows section */}
      {newRows.map((row, idx) => {
        const diagOptions = row.specialisation
          ? config.patientInfo.function[row.specialisation]?.diagnosis || []
          : [];

        return (
          <Row key={idx} className="align-items-center mb-3">
            <Col>
              <Form.Select
                value={row.specialisation}
                onChange={(e) => updateRow(idx, 'specialisation', e.target.value)}
                disabled={row.saved}
              >
                <option value="">{t('Select Specialisation')}</option>
                {specialisations.map((spec) => (
                  <option key={spec} value={spec}>{t(spec)}</option>
                ))}
              </Form.Select>
            </Col>
            <Col>
              <Form.Select
                value={row.diagnosis}
                onChange={(e) => updateRow(idx, 'diagnosis', e.target.value)}
                disabled={row.saved}
              >
                <option value="">{t('Select Diagnosis')}</option>
                {diagOptions.map((diag) => (
                  <option key={diag} value={diag}>{t(diag)}</option>
                ))}
                <option value="All">{t("All")}</option>
              </Form.Select>
            </Col>
            <Col>
              <Form.Select
                value={row.frequency}
                onChange={(e) => updateRow(idx, 'frequency', e.target.value)}
                disabled={row.saved}
              >
                <option value="">{t("SelectFrequency")}</option>
                {config.RecomendationInfo.frequency.map((freq) => (
                  <option key={freq} value={freq}>{t(freq)}</option>
                ))}
              </Form.Select>
            </Col>
            <Col xs="auto" className="d-flex">
              {!row.saved && (
                <Button variant="success" className="me-2" onClick={() => saveRow(idx)}>
                  {t("Save")}
                </Button>
              )}
              {row.saved && idx === newRows.length - 1 && (
                <Button variant="secondary" onClick={addNewRow}>
                  +
                </Button>
              )}
            </Col>
          </Row>
        );
      })}

    </Row>
      

  {/* Description Section with Spacing & Shadow Separator */}
  <Row className="pb-3 mb-3 border-bottom">
    <Col>
      <h5>{t("Description")}</h5>
      <p className="text-muted">{item.description}</p>
    </Col>
  </Row>

  {/* Content Type and Source Side-by-Side */}
  <Row className="pb-3 mb-3">
    <Col>
      <h5>{t("Source")}</h5>
      <ListGroup variant="flush">
                      <ListGroup.Item className="text-center">{renderMediaContent()}</ListGroup.Item>
      </ListGroup>
    </Col>
  </Row>

        <hr />
        <h5>{t('Assign as initial intervention for patietns with specific diagnoses')}</h5>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <ListGroup>
            <ListGroup.Item>
              <label>
                <input
                  type="checkbox"
                  checked={selectedAll}
                  onChange={handleAllCheckboxChange}
                  className="me-2"
                />
                {t("All")}
              </label>
            </ListGroup.Item>
            {!selectedAll &&
              diagnoses.map((diagnosis: string) => {
                // Is the diagnosis explicitly recommended?
                const isSpecificallyRecommended = item.patient_types?.some(
                  (pt) => pt.diagnosis === diagnosis
                );

                // Is the diagnosis type covered by any "All" entry for the user's specialisations?
                const isRecommendedForAllType = item.patient_types?.some(
                  (pt) =>
                    pt.diagnosis === 'All' &&
                    specialisations.includes(pt.type) // matches any of the user's specialisations
                );

                const showRecommended = isSpecificallyRecommended || isRecommendedForAllType;

                return (
                  <ListGroup.Item key={diagnosis}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedDiagnoses.includes(diagnosis)}
                        onChange={() => handleCheckboxChange(diagnosis)}
                        className="me-2"
                      />
                      {t(diagnosis)}{' '}
                      {showRecommended && <span className="text-success">({t("Recommended")})</span>}
                    </label>
                  </ListGroup.Item>
                );
              })}

          </ListGroup>
        </div>
      </Modal.Body>
      <Modal.Footer />
    </Modal>

    {showScheduler && <InterventionRepeatModal show={true} onHide={() => setShowScheduler(false)} patient={selectedDiagnose} intervention={selectedIntervention}/>}

    </>
  );
};

export default ProductPopup;
