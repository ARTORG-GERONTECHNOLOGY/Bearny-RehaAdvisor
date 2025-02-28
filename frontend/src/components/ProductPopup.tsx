import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { Col, ListGroup, Modal, Row, Badge } from 'react-bootstrap';
import apiClient from '../api/client';
import config from '../config/config.json';
import authStore from '../stores/authStore';
import { generateTagColors, getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../utils/interventions';
import { Document, Page, pdfjs } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from "react-player";
import ReactAudioPlayer from 'react-audio-player';

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
  // @ts-ignore
  const diagnoses = config?.patientInfo?.function?.[authStore?.specialisation]?.diagnosis || [];

  useEffect(() => {
    if (show) {
      fetchAssignedDiagnoses();
    }
  }, [show]);

  const renderMediaContent = () => {
      if (!item.media_file && !item.link) return <p className="text-muted">No media available</p>;
  
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
              <Document file={item.media_url} loading={<p>Loading PDF...</p>}>
                <Page pageNumber={1} width={300} />
              </Document>
              <a href={item.media_file} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-2">
                Open PDF
              </a>
            </div>
          );
        case 'Image':
          return <img src={item.media_file} alt="Recommendation" className="img-fluid rounded shadow" />;
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
              Open Resource
            </a>
          );
      }
    };

  const fetchAssignedDiagnoses = async () => {
    try {
      const response = await apiClient.get(
        `recommendations/${item['_id']}/assigned-diagnoses/${authStore.specialisation}/therapist/${authStore.id}`,
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

    try {
      const endpoint = isChecked ? 'recommendations/remove-from-patient-types/' : 'recommendations/assign-to-patient-types/';
      await apiClient.post(endpoint, {
        diagnosis,
        intervention_id: item['_id'],
        therapist: authStore.id,
      });
    } catch (error) {
      console.error(`Error updating intervention for ${diagnosis}:`, error);
    }
  };

  const handleAllCheckboxChange = async () => {
    const newSelectedAll = !selectedAll;
    setSelectedAll(newSelectedAll);
    setSelectedDiagnoses(newSelectedAll ? diagnoses : []);

    try {
      await apiClient.post(newSelectedAll ? 'recommendations/assign-to-patient-types/' : 'recommendations/remove-from-patient-types/', {
        diagnosis: 'all',
        intervention_id: item['_id'],
        therapist: authStore.id,
      });
    } catch (error) {
      console.error('Error updating "all" checkbox:', error);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton className="d-flex justify-content-between align-items-center">
      <Modal.Title>
      <h2>{item.title}</h2>
      <h3 className="text-muted">{item.content_type}</h3>

      {/* Beneft for Section - Directly Below Content Type */}
      {item.benefitFor?.length > 0 && (<>
        
            <div className="mt-2 d-flex flex-wrap gap-2">
              {item.benefitFor.map((benefit) => (
                <Badge
                  key={benefit}
                  style={{ color: 'white' }}
                  className="me-1"
                >
                  {benefit}
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
              {tag}
            </Badge>
          ))}
        </div>
      )}

    
    </Modal.Title>
    </Modal.Header>
    <Modal.Body>

  {/* Description Section with Spacing & Shadow Separator */}
  <Row className="pb-3 mb-3 border-bottom">
    <Col>
      <h5>Description</h5>
      <p className="text-muted">{item.description}</p>
    </Col>
  </Row>

  {/* Content Type and Source Side-by-Side */}
  <Row className="pb-3 mb-3">
    <Col>
      <h5>Source</h5>
      <ListGroup variant="flush">
                      <ListGroup.Item className="text-center">{renderMediaContent()}</ListGroup.Item>
      </ListGroup>
    </Col>
  </Row>

        <hr />
        <h5>{t('Assign to Patient Types')}</h5>
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
                All
              </label>
            </ListGroup.Item>
            {!selectedAll &&
              diagnoses.map((diagnosis: string) => (
                <ListGroup.Item key={diagnosis}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedDiagnoses.includes(diagnosis)}
                      onChange={() => handleCheckboxChange(diagnosis)}
                      className="me-2"
                    />
                    {diagnosis}
                  </label>
                </ListGroup.Item>
              ))}
          </ListGroup>
        </div>
      </Modal.Body>
      <Modal.Footer />
    </Modal>
  );
};

export default ProductPopup;
