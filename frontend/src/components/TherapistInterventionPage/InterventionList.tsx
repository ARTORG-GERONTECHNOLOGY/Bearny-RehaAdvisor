// components/TherapistInterventionPage/InterventionList.tsx
import React, { useEffect, useState } from 'react';
import { ListGroup, Badge, Spinner } from 'react-bootstrap';
import { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../../utils/interventions';
import { translateText } from '../../utils/translate';

interface Intervention {
  _id: string;
  title: string;
  content_type: string;
  media_url?: string;
  link?: string;
  tags?: string[];
}

interface TitleMap { [id: string]: { title: string; lang: string | null } }

interface Props {
  items: Intervention[];
  onClick: (item: Intervention) => void;
  t: (key: string) => string;
  tagColors: Record<string, string>;
  /** Optional: if provided, use these titles and do NOT translate here */
  translatedTitles?: TitleMap;
}

const InterventionList: React.FC<Props> = ({ items, onClick, t, tagColors, translatedTitles }) => {
  const [localTitles, setLocalTitles] = useState<TitleMap>({});
  const [loading, setLoading] = useState<boolean>(!translatedTitles);

  // Only translate locally if parent didn't provide translatedTitles
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

  if (loading) {
    return (
      <div className="text-center my-4" aria-live="polite" role="status">
        <Spinner animation="border" role="status" />
        <div>{t('Loading interventions...')}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-muted my-4" role="alert">
        {t('No interventions found.')}
      </div>
    );
  }

  return (
    <ListGroup className="shadow-sm w-100 mt-4" aria-label={t('Intervention List')}>
      {items.map((rec) => {
        const translated = titles[rec._id];
        const title = translated?.title || rec.title;
        const originalLang = translated?.lang;
        const isTranslated =
          originalLang && title.trim().toLowerCase() !== rec.title.trim().toLowerCase();

        return (
          <ListGroup.Item
            key={rec._id}
            action
            onClick={() => onClick(rec)}
            className="d-flex justify-content-between align-items-center flex-wrap"
            aria-label={t('Intervention')}
          >
            <div className="d-flex flex-column">
              <strong {...(isTranslated ? { title: `Original: ${rec.title}` } : {})}>
                {title}
              </strong>

              {isTranslated && (
                <small className="text-muted fst-italic">
                  ({t('Translated from')}: {originalLang})
                </small>
              )}

              <div className="text-muted">{t(rec.content_type)}</div>

              {rec.tags?.length > 0 && (
                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                  {rec.tags.map((tag) => (
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
              )}
            </div>

            <div>
              <Badge bg={getBadgeVariantFromUrl(rec.media_url, rec.link)} aria-label={t('Media type')}>
                {t(getMediaTypeLabelFromUrl(rec.media_url, rec.link))}
              </Badge>
            </div>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
};

export default InterventionList;
