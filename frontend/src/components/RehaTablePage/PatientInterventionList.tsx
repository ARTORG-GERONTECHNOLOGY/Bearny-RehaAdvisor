// src/components/RehaTablePage/PatientInterventionList.tsx
import React from 'react';
import { Card, Badge, ButtonGroup, Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { TFunction } from 'i18next';
import { FaChartBar, FaCommentDots, FaEdit, FaMinus, FaPlus, FaGlobe } from 'react-icons/fa';

import { Intervention } from '../../types';
import { getTagColor } from '../../utils/interventions';

// ---- helpers (paste from above) ----
// (Media helpers + getAllMedia + getMediaBadge + getTagsForItem + sameText + toLangList)
// ------------------------------------

interface PatientInterventionListProps {
  t: TFunction;
  titleMap: Record<string, { title: string; lang: string | null }>;
  typeMap: Record<string, string>;
  tagColors: Record<string, string>;

  patientData: { interventions: Intervention[] } & Record<string, any>;
  activeItems: Intervention[];
  pastItems: Intervention[];

  handleExerciseClick: (intervention: Intervention) => void;
  showStats: (intervention: Intervention) => void;
  openFeedbackBrowser: (intervention: Intervention) => void;
  handleModifyIntervention: (intervention: Intervention) => void;
  handleDeleteExercise: (id: string) => void;
  handleAddIntervention: (intervention: Intervention) => void;
}

const PatientInterventionList: React.FC<PatientInterventionListProps> = ({
  t,
  titleMap,
  typeMap,
  tagColors,
  patientData,
  activeItems,
  pastItems,
  handleExerciseClick,
  showStats,
  openFeedbackBrowser,
  handleModifyIntervention,
  handleDeleteExercise,
  handleAddIntervention,
}) => {
  const renderRow = (intervention: any, isPast: boolean) => {
    const translated = titleMap[intervention._id];
    const title = translated?.title || intervention.title || '';
    const originalLang = translated?.lang || null;
    const isTranslated = Boolean(originalLang) && !sameText(title, intervention.title || '');

    const typeLabel = typeMap[intervention._id] || intervention.content_type || '';

    const langs = toLangList(intervention?.available_languages);
    const langLabel = String(intervention?.language || '').toUpperCase();

    const media = getAllMedia(intervention);
    const mediaBadge = getMediaBadge(media);

    const tags = getTagsForItem(intervention);

    const patientHasIntervention = patientData?.interventions?.find(
      (item: any) => item?._id === intervention?._id
    );
    const hasFuture =
      patientHasIntervention?.dates?.some((d: any) => new Date(d.datetime) > new Date()) || false;
    const assigned = !!patientHasIntervention;

    return (
      <div
        key={intervention._id}
        className={`d-flex justify-content-between align-items-start mb-2 p-2 rounded ${isPast ? 'border' : 'shadow-sm'}`}
        style={{
          cursor: 'pointer',
          backgroundColor: isPast ? '#fcfcfd' : '#f8f9fa',
          gap: '0.5rem',
        }}
        onClick={() => handleExerciseClick(intervention)}
      >
        <div className="flex-grow-1">
          {isTranslated ? (
            <OverlayTrigger overlay={<Tooltip>{intervention.title}</Tooltip>}>
              <strong>{title}</strong>
            </OverlayTrigger>
          ) : (
            <strong>{title}</strong>
          )}

          <div className="text-muted d-flex align-items-center gap-2 flex-wrap mt-1">
            <span>{t(String(typeLabel))}</span>

            {!!langLabel && (
              <Badge bg="secondary" className="d-inline-flex align-items-center gap-1">
                <FaGlobe />
                {langLabel}
              </Badge>
            )}

            {langs.length > 0 && (
              <Badge bg="light" text="dark">
                {t('Languages')}: {langs.map((l) => l.toUpperCase()).join(', ')}
              </Badge>
            )}
          </div>

          <div className="mt-1">
            <Badge bg={mediaBadge.variant}>{t(mediaBadge.label)}</Badge>
          </div>

          {tags.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-1">
              {tags.slice(0, 10).map((tag: string) => (
                <Badge
                  key={tag}
                  style={{
                    backgroundColor: getTagColor(tagColors, tag) || '#888',
                    color: '#fff',
                  }}
                >
                  {t(tag)}
                </Badge>
              ))}
              {tags.length > 10 && (
                <Badge bg="light" text="dark">
                  +{tags.length - 10}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: '0 0 auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="ms-2">
            <ButtonGroup size="sm" vertical>
              {assigned && (
                <>
                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                    <Button
                      variant="outline-primary"
                      onClick={() => showStats(intervention)}
                      aria-label={t('Statistics')}
                    >
                      <FaChartBar />
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Feedback')}</Tooltip>}>
                    <Button
                      variant="outline-info"
                      onClick={() => openFeedbackBrowser(intervention)}
                      aria-label={t('Feedback')}
                    >
                      <FaCommentDots />
                    </Button>
                  </OverlayTrigger>
                </>
              )}

              {/* Active list: modify/remove if future exists */}
              {!isPast && assigned && hasFuture && (
                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                  <Button
                    variant="outline-secondary"
                    onClick={() => handleModifyIntervention(intervention)}
                    aria-label={t('Modify')}
                  >
                    <FaEdit />
                  </Button>
                </OverlayTrigger>
              )}

              {!isPast && hasFuture && (
                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                  <Button
                    variant="outline-danger"
                    onClick={() => handleDeleteExercise(intervention._id)}
                    aria-label={t('Remove')}
                  >
                    <FaMinus />
                  </Button>
                </OverlayTrigger>
              )}

              {/* Past list: schedule again */}
              {isPast && (
                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Schedule again')}</Tooltip>}>
                  <Button
                    variant="outline-success"
                    onClick={() => handleAddIntervention(intervention)}
                    aria-label={t('Schedule again')}
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
  };

  return (
    <Card className="d-flex flex-column flex-1 min-h-0">
      <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
        <div className="flex-1 min-h-0 scroll-y">
          {/* Active */}
          <div className="mb-2">
            <div className="fw-bold mb-2">{t('Active interventions')}</div>
            {activeItems.length === 0 && (
              <div className="text-muted mb-3">{t('No active interventions.')}</div>
            )}
            {activeItems.map((it: any) => renderRow(it, false))}
          </div>

          {/* Past */}
          <hr className="my-3" />
          <div className="mb-2">
            <div className="fw-bold mb-2">{t('Past interventions')}</div>
            {pastItems.length === 0 && (
              <div className="text-muted">{t('No past interventions.')}</div>
            )}
            {pastItems.map((it: any) => renderRow(it, true))}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default PatientInterventionList;
