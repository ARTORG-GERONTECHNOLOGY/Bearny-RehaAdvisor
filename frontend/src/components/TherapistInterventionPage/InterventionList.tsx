// components/TherapistInterventionPage/InterventionList.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ListGroup, Badge, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { translateText } from '../../utils/translate';
import {
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  InterventionMedia,
} from '../../utils/interventions';
import { getTagColor } from '../../utils/interventions';
interface Intervention {
  _id: string;
  title: string;
  content_type: string;

  aims?: string[];
  tags?: string[];
  media?: InterventionMedia[];

  language?: string;
  available_languages?: string[];

  is_private?: boolean;
  private_patient_id?: string | null;
  external_id?: string;
}

interface TitleMap {
  [id: string]: { title: string; lang: string | null };
}

interface Props {
  items: Intervention[];
  onClick: (item: Intervention) => void;
  t: (key: string) => string;
  tagColors: Record<string, string>;
  translatedTitles?: TitleMap;
}

const InterventionList: React.FC<Props> = ({ items, onClick, t, tagColors, translatedTitles }) => {
  const [localTitles, setLocalTitles] = useState<TitleMap>({});
  const [loading, setLoading] = useState<boolean>(!translatedTitles);

  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const titles = translatedTitles ?? localTitles;

  useEffect(() => {
    if (translatedTitles) {
      setLoading(false);
      return;
    }

    const translateAll = async () => {
      setLoading(true);
      const updates: TitleMap = {};

      for (const rec of safeItems) {
        if (!rec?.title) continue;
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(rec.title);
          updates[rec._id] = {
            title: translatedText || rec.title,
            lang: detectedSourceLanguage || null,
          };
        } catch {
          updates[rec._id] = { title: rec.title, lang: null };
        }
      }

      setLocalTitles(updates);
      setLoading(false);
    };

    if (safeItems.length > 0) translateAll();
    else setLoading(false);
  }, [safeItems, translatedTitles]);

  if (loading) {
    return (
      <div className="text-center my-4" aria-live="polite" role="status">
        <Spinner animation="border" role="status" />
        <div>{t('Loading interventions...')}</div>
      </div>
    );
  }

  if (safeItems.length === 0) {
    return (
      <div className="text-center text-muted my-4" role="alert">
        {t('No interventions found.')}
      </div>
    );
  }

  return (
    <ListGroup className="shadow-sm w-100 mt-4" aria-label={t('Intervention List')}>
      {safeItems.map((rec) => {
        const translated = titles[rec._id];
        const title = translated?.title || rec.title;
        const originalLang = translated?.lang;

        const isTranslated =
          !!originalLang && title.trim().toLowerCase() !== (rec.title || '').trim().toLowerCase();

        const badgeVariant = getBadgeVariantFromIntervention(rec as any);
        const mediaLabel = getMediaTypeLabelFromIntervention(rec as any);

        const aims = Array.isArray(rec.aims) ? rec.aims.filter(Boolean) : [];
        const tags = Array.isArray(rec.tags) ? rec.tags.filter(Boolean) : [];

        const isPrivate = Boolean(rec.is_private);

        const lang = String(rec.language || '')
          .trim()
          .toLowerCase();
        const available = Array.isArray(rec.available_languages) ? rec.available_languages : [];
        const otherLangs = available
          .map((x) =>
            String(x || '')
              .trim()
              .toLowerCase()
          )
          .filter((x) => x && x !== lang);

        const langBadge = lang ? lang.toUpperCase() : null;
        const globeHint = otherLangs.length
          ? otherLangs.map((x) => x.toUpperCase()).join(', ')
          : t('No other languages');

        return (
          <ListGroup.Item
            key={rec._id}
            action
            onClick={() => onClick(rec)}
            className="d-flex justify-content-between align-items-center flex-wrap gap-2"
            aria-label={t('Intervention')}
          >
            <div className="d-flex flex-column" style={{ minWidth: 260, flex: 1 }}>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <strong {...(isTranslated ? { title: `Original: ${rec.title}` } : {})}>
                  {title}
                </strong>

                {isPrivate ? (
                  <Badge bg="dark" title={t('Private intervention')}>
                    {t('Private')}
                  </Badge>
                ) : null}
              </div>

              {isTranslated && (
                <small className="text-muted fst-italic">
                  ({t('Translated from')}: {String(originalLang).toUpperCase()})
                </small>
              )}

              <div className="text-muted">{t(rec.content_type)}</div>

              {aims.length ? (
                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Aims')}>
                  {aims.map((a) => (
                    <Badge key={a} bg="info" text="dark" className="text-capitalize">
                      {t(a)}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {tags.length ? (
                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      bg=""
                      style={{
                        backgroundColor: getTagColor(tagColors, tag) || 'gray',
                        color: '#fff',
                      }}
                      className="text-capitalize"
                    >
                      {t(tag)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="d-flex align-items-center gap-2">
              {langBadge ? (
                <>
                  <Badge bg="secondary">{langBadge}</Badge>

                  <OverlayTrigger placement="top" overlay={<Tooltip>{globeHint}</Tooltip>}>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={t('Show other languages')}
                      style={{ cursor: 'pointer', userSelect: 'none', lineHeight: 1 }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation(); // don’t trigger row click
                        onClick(rec); // open details modal
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onClick(rec);
                        }
                      }}
                    >
                      🌐
                    </span>
                  </OverlayTrigger>
                </>
              ) : null}

              <Badge bg={badgeVariant as any} aria-label={t('Media type')}>
                {t(mediaLabel)}
              </Badge>
            </div>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
};

export default InterventionList;
