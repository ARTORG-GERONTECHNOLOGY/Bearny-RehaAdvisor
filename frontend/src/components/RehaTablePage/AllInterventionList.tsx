// src/components/RehaTablePage/AllInterventionList.tsx
import React from 'react';
import {
  Card,
  Badge,
  ButtonGroup,
  Button,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { TFunction } from 'i18next';
import {
  FaChartBar,
  FaCommentDots,
  FaEdit,
  FaPlus,
  FaMinus,
} from 'react-icons/fa';

import { Intervention } from '../../types';
import {
  getBadgeVariantFromUrl,
  getMediaTypeLabelFromUrl,
} from '../../utils/interventions';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

interface AllInterventionListProps {
  t: TFunction;
  titleMap: Record<string, { title: string; lang: string | null }>;
  typeMap: Record<string, string>;
  patientData: { interventions: Intervention[] } & Record<string, any>;
  visibleItems: Intervention[];

  handleExerciseClick: (intervention: Intervention) => void;
  showStats: (intervention: Intervention) => void;
  openFeedbackBrowser: (intervention: Intervention) => void;
  handleModifyIntervention: (intervention: Intervention) => void;
  handleDeleteExercise: (id: string) => void;
  handleAddIntervention: (intervention: Intervention) => void;
}

const AllInterventionList: React.FC<AllInterventionListProps> = ({
  t,
  titleMap,
  typeMap,
  patientData,
  visibleItems,
  handleExerciseClick,
  showStats,
  openFeedbackBrowser,
  handleModifyIntervention,
  handleDeleteExercise,
  handleAddIntervention,
}) => {
  return (
    <Card className="d-flex flex-column flex-1 min-h-0">
      <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
        <div className="flex-1 min-h-0 scroll-y">
          {visibleItems.map((intervention) => {
            const translated = titleMap[intervention._id];
            const title = translated?.title || intervention.title;
            const originalLang = translated?.lang;
            const isTranslated =
              originalLang &&
              title.trim().toLowerCase() !==
                intervention.title.trim().toLowerCase();
            const typeLabel =
              typeMap[intervention._id] ||
              capitalize(intervention.content_type || '');
            const patientHasIntervention = patientData?.interventions?.find(
              (item: any) => item._id === intervention._id
            );
            const hasFuture =
              patientHasIntervention?.dates?.some(
                (d: any) => new Date(d.datetime) > new Date()
              ) || false;
            const assigned = !!patientHasIntervention;

            return (
              <div
                key={intervention._id}
                className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
                style={{
                  cursor: 'pointer',
                  backgroundColor: '#f8f9fa',
                  gap: '0.5rem',
                }}
                onClick={() => handleExerciseClick(intervention)}
              >
                <div className="flex-grow-1">
                  <strong
                    {...(isTranslated
                      ? { title: `Original: ${intervention.title}` }
                      : {})}
                  >
                    {title}
                  </strong>
                  {isTranslated && (
                    <div
                      className="text-muted fst-italic"
                      style={{ fontSize: '0.85rem' }}
                    >
                      ({t('Translated from')}: {originalLang})
                    </div>
                  )}
                  <div className="text-muted">{typeLabel}</div>
                  <Badge
                    bg={getBadgeVariantFromUrl(
                      intervention.media_url,
                      intervention.link
                    )}
                  >
                    {t(
                      getMediaTypeLabelFromUrl(
                        intervention.media_url,
                        intervention.link
                      )
                    )}
                  </Badge>
                </div>
                <div style={{ flex: '0 0 auto' }}>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="ms-2"
                  >
                    <ButtonGroup size="sm" vertical>
                      {assigned && (
                        <>
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Statistics')}</Tooltip>}
                          >
                            <Button
                              variant="outline-primary"
                              onClick={() => showStats(intervention)}
                              aria-label={t('Statistics')}
                            >
                              <FaChartBar />
                            </Button>
                          </OverlayTrigger>
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Feedback')}</Tooltip>}
                          >
                            <Button
                              variant="outline-info"
                              onClick={() =>
                                openFeedbackBrowser(intervention)
                              }
                              aria-label={t('Feedback')}
                            >
                              <FaCommentDots />
                            </Button>
                          </OverlayTrigger>
                        </>
                      )}
                      {assigned && hasFuture ? (
                        <>
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Modify')}</Tooltip>}
                          >
                            <Button
                              variant="outline-secondary"
                              onClick={() =>
                                handleModifyIntervention(intervention)
                              }
                              aria-label={t('Modify')}
                            >
                              <FaEdit />
                            </Button>
                          </OverlayTrigger>
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Remove')}</Tooltip>}
                          >
                            <Button
                              variant="outline-danger"
                              onClick={() =>
                                handleDeleteExercise(intervention._id)
                              }
                              aria-label={t('Remove')}
                            >
                              <FaMinus />
                            </Button>
                          </OverlayTrigger>
                        </>
                      ) : (
                        <OverlayTrigger
                          placement="left"
                          overlay={<Tooltip>{t('Add')}</Tooltip>}
                        >
                          <Button
                            variant="outline-success"
                            onClick={() => handleAddIntervention(intervention)}
                            aria-label={t('Add')}
                          >
                            <FaPlus />
                          </Button>
                        </OverlayTrigger>
                      )}
                    </ButtonGroup>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
};

export default AllInterventionList;
