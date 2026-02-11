// components/TherapistInterventionPage/InterventionList.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ListGroup, Badge, Spinner } from 'react-bootstrap';
import { translateText } from '../../utils/translate';
import {
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  type InterventionMedia,
} from '../../utils/interventions';

interface Intervention {
  _id: string;
  title: string;
  content_type: string;

  // ✅ NEW: aims is its own field; everything else is tags
  aims?: string[]; // e.g. ["Education", "Exercise", ...] (optional)
  tags?: string[]; // everything except aims

  media?: InterventionMedia[];
  language?: string;

  is_private?: boolean;
  private_patient_id?: string | null;
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

  useEffect(() => {
    if (translatedTitles) {
      setLoading(false);
      return;
    }

    const translateAll = async () => {
      setLoading(true);
      const updates: TitleMap = {};

      for (const rec of items) {
        if (!rec?.title) continue;
        try {
          const { translatedText, detectedSourceLanguage } = await translateText(rec.title);
          updates[rec._id] = { title: translatedText, lang: detectedSourceLanguage };
        } catch {
          updates[rec._id] = { title: rec.title, lang: null };
        }
      }

      setLocalTitles(updates);
      setLoading(false);
    };

    if (items.length > 0) translateAll();
    else setLoading(false);
  }, [items, translatedTitles]);

  const titles = translatedTitles ?? localTitles;

  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

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
                <strong {...(isTranslated ? { title: `Original: ${rec.title}` } : {})}>{title}</strong>

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

              {/* ✅ aims is separate */}
              {aims.length ? (
                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Aims')}>
                  {aims.map((a) => (
                    <Badge key={a} bg="info" text="dark" className="text-capitalize">
                      {t(a)}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {/* ✅ everything else is tags */}
              {tags.length ? (
                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      bg=""
                      style={{ backgroundColor: tagColors[tag] || 'gray', color: '#fff' }}
                      className="text-capitalize"
                    >
                      {t(tag)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="d-flex align-items-center gap-2">
              {rec.language ? (
                <Badge bg="secondary" aria-label={t('Language')}>
                  {String(rec.language).toUpperCase()}
                </Badge>
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
