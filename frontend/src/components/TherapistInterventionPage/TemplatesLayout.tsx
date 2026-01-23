import React from 'react';
import {
  Row,
  Col,
  Card,
  Form,
  Nav,
  Button,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Badge,
} from 'react-bootstrap';
import Select from 'react-select';
import { FaPlus, FaMinus, FaEdit, FaUndo } from 'react-icons/fa';
import config from '../../config/config.json';
import type { TemplateItem } from '../../types/templates';
import type { InterventionTypeTh } from '../../types';

export type TemplatesFiltersState = {
  tSearchTerm: string;
  tPatientTypeFilter: string;
  tContentTypeFilter: string;
  tTagFilter: string[];
  tBenefitForFilter: string[];
  tFrequencyFilter: string;
};

type TemplateLeftTab = 'my' | 'all';

type Props = {
  t: any;

  templateDiag: string;
  onTemplateDiag: (v: string) => void;

  templateHorizon: number;
  onTemplateHorizon: (v: number) => void;

  diagnoses: string[];
  patientTypes: string[];

  templateLeftTab: TemplateLeftTab;
  onTemplateLeftTab: (v: TemplateLeftTab) => void;

  templateItems: TemplateItem[];
  tLoading: boolean;

  translatedTitles: Record<string, { title: string; lang: string | null }>;
  getSegments: (it: TemplateItem) => any[];
  segmentSummary: (seg: any, it: TemplateItem) => string;

  onTemplateItemClick: (it: TemplateItem) => void;
  onModifyTemplate: (it: TemplateItem) => void;
  onRemoveTemplateItem: (diagnosis: string, interventionId: string) => void;

  browseAllItems: InterventionTypeTh[];
  findTemplateFor: (intId: string) => TemplateItem | undefined;
  onOpenAssign: (id: string, mode: 'create' | 'modify') => void;

  filters: TemplatesFiltersState;
  onFilters: (next: TemplatesFiltersState) => void;
  onResetFilters: () => void;

  timeline: React.ReactNode;
  tagColors: Record<string, string>;
};

const TemplatesLayout: React.FC<Props> = ({
  t,
  templateDiag,
  onTemplateDiag,
  templateHorizon,
  onTemplateHorizon,
  diagnoses,
  patientTypes,
  templateLeftTab,
  onTemplateLeftTab,
  templateItems,
  tLoading,
  translatedTitles,
  getSegments,
  segmentSummary,
  onTemplateItemClick,
  onModifyTemplate,
  onRemoveTemplateItem,
  browseAllItems,
  findTemplateFor,
  onOpenAssign,
  filters,
  onFilters,
  onResetFilters,
  timeline,
  tagColors,
}) => {
  return (
    <Row className="g-3">
      <Col xs={12} md={4}>
        <Card className="mb-3">
          <Card.Header>{t('Template filters')}</Card.Header>
          <Card.Body>
            <Form.Group className="mb-2">
              <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
              <Form.Select value={templateDiag} onChange={(e) => onTemplateDiag(e.target.value)}>
                <option value="">{t('All')}</option>
                {diagnoses.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group>
              <Form.Label>{t('Horizon (days)')}</Form.Label>
              <Form.Control
                type="number"
                min={14}
                max={180}
                value={templateHorizon}
                onChange={(e) => onTemplateHorizon(parseInt(e.target.value || '84', 10))}
              />
            </Form.Group>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>{t('Content')}</div>

            <Nav
              variant="tabs"
              activeKey={templateLeftTab}
              onSelect={(k) => onTemplateLeftTab((k as TemplateLeftTab) || 'my')}
            >
              <Nav.Item>
                <Nav.Link eventKey="my">{t('My Template')}</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="all">{t('Browse All')}</Nav.Link>
              </Nav.Item>
            </Nav>
          </Card.Header>

          {templateLeftTab === 'my' ? (
            <Card.Body style={{ maxHeight: 480, overflowY: 'auto' }}>
              {tLoading && <div className="text-muted">{t('Loading...')}</div>}
              {!tLoading && templateItems.length === 0 && (
                <div className="text-muted">{t('No template items')}</div>
              )}

              {templateItems.map((it, idx) => (
                <div
                  key={`${it.intervention._id}-${it.diagnosis}-${idx}`}
                  className="d-flex justify-content-between align-items-start mb-2 p-2 border rounded"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onTemplateItemClick(it)}
                  title={t('Click to view details')}
                >
                  <div className="me-2">
                    <div className="fw-semibold">
                      {translatedTitles[it.intervention._id]?.title || it.intervention.title}
                      {translatedTitles[it.intervention._id]?.lang && (
                        <span className="text-muted ms-2 small">
                          ({t('Translated from')}: {translatedTitles[it.intervention._id]?.lang})
                        </span>
                      )}
                    </div>

                    <div className="small text-muted">
                      {t('For')}: {it.diagnosis}
                    </div>

                    <div className="small text-muted mt-1">
                      {getSegments(it).map((seg, i) => (
                        <div key={i}>{segmentSummary(seg, it)}</div>
                      ))}
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <ButtonGroup size="sm" vertical>
                      <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                        <Button
                          variant="outline-secondary"
                          onClick={() => onModifyTemplate(it)}
                          title={t('Modify from a specific day onward')}
                        >
                          <FaEdit />
                        </Button>
                      </OverlayTrigger>

                      <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                        <Button
                          variant="outline-danger"
                          onClick={() => onRemoveTemplateItem(it.diagnosis, it.intervention._id)}
                        >
                          <FaMinus />
                        </Button>
                      </OverlayTrigger>
                    </ButtonGroup>
                  </div>
                </div>
              ))}
            </Card.Body>
          ) : (
            <Card.Body className="mb-3">
              <Row className="mb-3">
                <Col>
                  <Form.Group controlId="tSearchInput">
                    <Form.Control
                      type="text"
                      placeholder={t('Search Interventions')}
                      value={filters.tSearchTerm}
                      onChange={(e) => onFilters({ ...filters, tSearchTerm: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row className="mb-3 g-3">
                <Col xs={12} md={6}>
                  <Form.Select
                    value={filters.tPatientTypeFilter}
                    onChange={(e) => onFilters({ ...filters, tPatientTypeFilter: e.target.value })}
                  >
                    <option value="">{t('All Patient Types')}</option>
                    {patientTypes.map((type: string) => (
                      <option key={type} value={type}>
                        {t(type)}
                      </option>
                    ))}
                  </Form.Select>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Select
                    value={filters.tContentTypeFilter}
                    onChange={(e) => onFilters({ ...filters, tContentTypeFilter: e.target.value })}
                  >
                    <option value="">{t('Filter by Content Type')}</option>
                    {(config as any).RecomendationInfo.types.map((type: string) => (
                      <option key={type} value={type}>
                        {t(type)}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              <Row className="mb-3 g-3">
                <Col xs={12} md={6}>
                  <Select
                    isMulti
                    options={(config as any).RecomendationInfo.tags.map((tag: string) => ({
                      value: tag,
                      label: t(tag),
                    }))}
                    value={filters.tTagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
                    onChange={(opts) => onFilters({ ...filters, tTagFilter: (opts || []).map((o: any) => o.value) })}
                    placeholder={t('Filter by Tags')}
                  />
                </Col>

                <Col xs={12} md={6}>
                  <Select
                    isMulti
                    options={(config as any).RecomendationInfo.benefits.map((b: string) => ({
                      value: b,
                      label: t(b),
                    }))}
                    value={filters.tBenefitForFilter.map((b) => ({ value: b, label: t(b) }))}
                    onChange={(opts) =>
                      onFilters({ ...filters, tBenefitForFilter: (opts || []).map((o: any) => o.value) })
                    }
                    placeholder={t('Filter by Benefit')}
                  />
                </Col>
              </Row>

              <Row className="mb-2">
                <Col>
                  <Button variant="outline-secondary" size="sm" onClick={onResetFilters}>
                    <FaUndo className="me-2" /> {t('Reset filters')}
                  </Button>
                </Col>
              </Row>

              <div style={{ maxHeight: 420, overflowY: 'auto' }} className="p-2">
                {browseAllItems.length === 0 && (
                  <div className="text-muted px-2">{t('No interventions match your filters.')}</div>
                )}

                {browseAllItems.map((intervention) => {
                  const displayTitle = translatedTitles[intervention._id]?.title ?? intervention.title;
                  const entry = findTemplateFor(intervention._id);
                  const inTemplate = !!entry;

                  return (
                    <div
                      key={intervention._id}
                      className="d-flex justify-content-between align-items-start mb-2 p-2 rounded border"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        // browsing list: click should still open details via page-level popup handler
                        // parent wires this by intercepting selection in the page
                      }}
                      title={t('Click to view details')}
                    >
                      <div className="me-2">
                        <div className="fw-semibold">{displayTitle}</div>

                        {intervention.tags?.length > 0 && (
                          <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                            {intervention.tags.map((tag) => (
                              <Badge
                                key={tag}
                                bg=""
                                className="me-1"
                                style={{ backgroundColor: tagColors[tag] || 'gray' }}
                              >
                                {t(tag)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        {!inTemplate ? (
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Add this intervention to your template')}</Tooltip>}
                          >
                            <Button
                              size="sm"
                              variant="outline-success"
                              onClick={() => onOpenAssign(intervention._id, 'create')}
                            >
                              <FaPlus className="me-1" />
                            </Button>
                          </OverlayTrigger>
                        ) : (
                          <ButtonGroup size="sm" vertical>
                            <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                              <Button variant="outline-secondary" onClick={() => onOpenAssign(entry!.intervention._id, 'modify')}>
                                <FaEdit />
                              </Button>
                            </OverlayTrigger>

                            <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                              <Button
                                variant="outline-danger"
                                onClick={() => onRemoveTemplateItem(entry!.diagnosis, intervention._id)}
                              >
                                <FaMinus />
                              </Button>
                            </OverlayTrigger>
                          </ButtonGroup>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card.Body>
          )}
        </Card>
      </Col>

      <Col xs={12} md={8}>
        <Card className="h-100">
          <Card.Body className="min-vh-50" style={{ overflow: 'auto' }}>
            {timeline}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default TemplatesLayout;
