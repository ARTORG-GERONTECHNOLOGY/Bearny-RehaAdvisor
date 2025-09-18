// components/TherapistInterventionPage/ProductPopup.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Col,
  Modal,
  Row,
  Badge,
  Button,
  Form,
  Container,
  OverlayTrigger,
  Tooltip,
  ButtonGroup,
  InputGroup
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Document, Page } from 'react-pdf';
import Microlink from '@microlink/react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import { FaPlus, FaEdit, FaTrash, FaSearch } from 'react-icons/fa';

import apiClient from '../../api/client';
import config from '../../config/config.json';
import authStore from '../../stores/authStore';

import ErrorAlert from '../common/ErrorAlert';
import TemplateAssignModal from './TemplateAssignModal';
import { getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { translateText } from '../../utils/translate';

type Props = {
  show: boolean;
  item: any;
  handleClose: () => void;
  tagColors: Record<string, string>;
};

const ProductPopup: React.FC<Props> = ({ show, item, handleClose, tagColors }) => {
  const { t } = useTranslation();

  const [translatedText, setTranslatedText]   = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang]       = useState('');
  const [titleLang, setTitleLang]             = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'create' | 'modify'>('create');
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string>('');

  const [assignedDiagSet, setAssignedDiagSet] = useState<Set<string>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [error, setError] = useState('');

  const specialisations = authStore.specialisation?.split(',').map((s) => s.trim()) || [];
  const allDiagnoses = useMemo(
    () => specialisations.flatMap(spec => config?.patientInfo?.function?.[spec]?.diagnosis || []),
    [specialisations]
  );

  const [diagSearch, setDiagSearch] = useState('');
  const filteredDiagnoses = useMemo(() => {
    const q = diagSearch.trim().toLowerCase();
    return q
      ? allDiagnoses.filter((d) => d.toLowerCase().includes(q))
      : allDiagnoses;
  }, [allDiagnoses, diagSearch]);

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  useEffect(() => {
    const translate = async () => {
      try {
        if (item?.description) {
          const { translatedText: tx, detectedSourceLanguage } = await translateText(item.description);
          setTranslatedText(tx);
          setDetectedLang(tx !== item.description ? detectedSourceLanguage : '');
        } else {
          setTranslatedText('');
          setDetectedLang('');
        }
        if (item?.title) {
          const { translatedText: tt, detectedSourceLanguage: tl } = await translateText(item.title);
          setTranslatedTitle(tt);
          setTitleLang(tt !== item.title ? tl : '');
        } else {
          setTranslatedTitle('');
          setTitleLang('');
        }
      } catch {
        setTranslatedText(item?.description || '');
        setTranslatedTitle(item?.title || '');
        setDetectedLang('');
        setTitleLang('');
      }
    };
    if (show) translate();
  }, [item, show]);

  const refreshAssignments = async () => {
    if (!show || !item?._id) return;
    try {
      setLoadingAssignments(true);
      const qs = new URLSearchParams({ horizon: '365' }).toString();
      const res = await apiClient.get(`therapists/${authStore.id}/template-plan?${qs}`);
      const items: any[] = Array.isArray(res.data?.items) ? res.data.items : [];
      const set = new Set<string>();
      for (const it of items) {
        if (it?.intervention?._id === item._id && it?.diagnosis) set.add(it.diagnosis);
      }
      setAssignedDiagSet(set);
    } catch {
      setAssignedDiagSet(new Set());
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => { refreshAssignments(); /* eslint-disable-next-line */ }, [show, item?._id]);

  const openAssign = (diag: string) => {
    setSelectedDiagnosis(diag);
    setAssignMode(assignedDiagSet.has(diag) ? 'modify' : 'create');
    setAssignOpen(true);
  };

  const removeFromTemplate = async (diag: string) => {
    try {
      await apiClient.post('interventions/remove-from-patient-types/', {
        diagnosis: diag,
        intervention_id: item._id,
        therapist: authStore.id,
      });
      await refreshAssignments();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || t('Failed to delete from template.'));
    }
  };

  const renderMediaContent = () => {
    const type = getMediaTypeLabelFromUrl(item?.media_file, item?.link);
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
              {t('Open PDF')}
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
            {t('Open Resource')}
          </a>
        );
    }
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title as="h2">
            {titleLang ? (
              <OverlayTrigger overlay={<Tooltip>{item.title}</Tooltip>}>
                <span>{translatedTitle}</span>
              </OverlayTrigger>
            ) : (
              item?.title
            )}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <ErrorAlert message={error} onClose={() => setError('')} />}

          <Container fluid>
            <Row className="mb-3">
              <Col xs={12} md={6}>
                <h5>{t('Description')}</h5>
                <p className="text-muted mb-0">
                  {detectedLang ? (
                    <OverlayTrigger overlay={<Tooltip>{item.description}</Tooltip>}>
                      <span>{translatedText}</span>
                    </OverlayTrigger>
                  ) : (
                    item?.description
                  )}
                </p>
              </Col>

              <Col xs={12} md={6}>
                <h5>{t('Media')}</h5>
                {renderMediaContent()}
              </Col>
            </Row>

            <Row className="mb-3">
              <Col>
                <h5>{t('Tags & Benefits')}</h5>
                <div className="mb-2">
                  {item?.tags?.map((tag: string) => (
                    <Badge
                      key={tag}
                      className="me-2 mb-1"
                      style={{ backgroundColor: tagColors[tag] || '#888', color: '#fff' }}
                      role="status"
                    >
                      {t(tag)}
                    </Badge>
                  ))}
                  {item?.benefitFor?.map((b: string) => (
                    <Badge key={b} className="me-2 mb-1 bg-info text-dark">
                      {b}
                    </Badge>
                  ))}
                </div>
              </Col>
            </Row>

            {/* Header + search */}
            <Row className="mb-2">
              <Col className="d-flex align-items-center justify-content-between">
                <h5 className="mb-0">{t('Add/modify in template by diagnosis')}</h5>
                <small className="text-muted">
                  {loadingAssignments ? t('Loading assignments…') : null}
                </small>
              </Col>
            </Row>
            <Row className="mb-3">
              <Col md={6}>
                <InputGroup>
                  <InputGroup.Text><FaSearch /></InputGroup.Text>
                  <Form.Control
                    placeholder={t('Search diagnoses')}
                    value={diagSearch}
                    onChange={(e) => setDiagSearch(e.target.value)}
                  />
                </InputGroup>
              </Col>
            </Row>

            {/* SCROLLABLE list of diagnoses */}
            <div className="diag-scroll" role="region" aria-label={t('Diagnoses')}>
              <Row className="g-2">
                {chunk(filteredDiagnoses, 2).map((pair, i) => (
                  <React.Fragment key={i}>
                    {pair.map((d) => {
                      const isAssigned = assignedDiagSet.has(d);
                      return (
                        <Col xs={12} md={6} key={d}>
                          <div className="d-flex align-items-center justify-content-between border rounded px-2 py-2">
                            <div className="me-2">
                              <div className="fw-semibold">
                                {d}{' '}
                                {isAssigned && (
                                  <Badge bg="success" className="ms-1">
                                    {t('Assigned')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <ButtonGroup size="sm">
                                <OverlayTrigger
                                  placement="top"
                                  overlay={<Tooltip>{isAssigned ? t('Modify from day…') : t('Add (Day S → N)')}</Tooltip>}
                                >
                                  <Button
                                    variant={isAssigned ? 'outline-secondary' : 'outline-success'}
                                    onClick={() => openAssign(d)}
                                  >
                                    {isAssigned ? <FaEdit /> : <FaPlus />}
                                  </Button>
                                </OverlayTrigger>

                                {isAssigned && (
                                  <OverlayTrigger
                                    placement="top"
                                    overlay={<Tooltip>{t('Delete from template')}</Tooltip>}
                                  >
                                    <Button
                                      variant="outline-danger"
                                      onClick={() => removeFromTemplate(d)}
                                    >
                                      <FaTrash />
                                    </Button>
                                  </OverlayTrigger>
                                )}
                              </ButtonGroup>
                            </div>
                          </div>
                        </Col>
                      );
                    })}
                  </React.Fragment>
                ))}
                {filteredDiagnoses.length === 0 && (
                  <Col>
                    <div className="text-muted">{t('No diagnoses match your search.')}</div>
                  </Col>
                )}
              </Row>
            </div>

            <Row className="mt-3">
              <Col>
                <small className="text-muted">
                  {t(
                    'This assigns a relative schedule (Day S → N) to the diagnosis template. Actual calendar dates are chosen when applying the template to a patient.'
                  )}
                </small>
              </Col>
            </Row>
          </Container>
        </Modal.Body>
      </Modal>

      {assignOpen && (
        <TemplateAssignModal
          show
          onHide={() => setAssignOpen(false)}
          interventionId={item?._id || null}
          diagnoses={allDiagnoses}
          defaultDiagnosis={selectedDiagnosis}
          mode={assignMode}
          onSuccess={refreshAssignments}
        />
      )}

      <style>{`
        .diag-scroll {
          max-height: 360px;
          overflow-y: auto;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 8px;
          background: #fff;
        }

        @media (min-height: 900px) {
          .diag-scroll { max-height: 480px; }
        }
      `}</style>
    </>
  );
};

export default ProductPopup;
