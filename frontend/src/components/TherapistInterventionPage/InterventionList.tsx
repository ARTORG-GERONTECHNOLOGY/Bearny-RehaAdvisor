// components/TherapistInterventionPage/InterventionList.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { translateText } from '@/utils/translate';
import { getTypeIcon, getContentTypeIcon, InterventionMedia } from '@/utils/interventions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import StarRating from '@/components/RehaTablePage/StarRating';
import { Badge } from '@/components/ui/badge';
import { FaLock } from 'react-icons/fa';

interface Intervention {
  _id: string;
  title: string;
  content_type: string;

  aims?: string[];
  tags?: string[];
  media?: InterventionMedia[];

  avg_rating?: number;

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
  translatedTitles?: TitleMap;
}

const InterventionList: React.FC<Props> = ({ items, onClick, t, translatedTitles }) => {
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
      <div className="text-center" aria-live="polite" role="status">
        <Spinner animation="border" role="status" />
        <div>{t('Loading interventions...')}</div>
      </div>
    );
  }

  if (safeItems.length === 0) {
    return (
      <div className="text-center text-muted" role="alert">
        {t('No interventions found.')}
      </div>
    );
  }

  return (
    <Table aria-label={t('Intervention List')} className="bg-white">
      <TableHeader>
        <TableRow>
          <TableHead>{t('Type')}</TableHead>
          <TableHead>{t('Name')}</TableHead>
          <TableHead>{t('Medium')}</TableHead>
          <TableHead>{t('languages')}</TableHead>
          <TableHead>{t('Rating')}</TableHead>
          <TableHead>{t('Tags')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {safeItems.map((rec) => {
          const translated = titles[rec._id];
          const title = translated?.title || rec.title;
          const originalLang = translated?.lang;

          const isTranslated =
            !!originalLang && title.trim().toLowerCase() !== (rec.title || '').trim().toLowerCase();

          const contentType = rec.content_type || t('Unknown');
          const aims = Array.isArray(rec.aims) ? rec.aims.filter(Boolean) : [];
          const tags = Array.isArray(rec.tags) ? rec.tags.filter(Boolean) : [];
          const availableLangs = Array.isArray(rec.available_languages)
            ? rec.available_languages.filter(Boolean)
            : [];
          const allLangs = rec.language
            ? [rec.language, ...availableLangs.filter((l: string) => l !== rec.language)]
            : availableLangs;
          const isPrivate = Boolean(rec.is_private);

          const TypeIcon = getTypeIcon(aims[0] || '');
          const MediaIcon = getContentTypeIcon(contentType);

          return (
            <TableRow
              key={rec._id}
              onClick={() => onClick(rec)}
              className="cursor-pointer"
              aria-label={t('Intervention')}
            >
              <TableCell>
                {!!aims[0] && (
                  <Badge
                    variant={'dashboard'}
                    className={
                      (aims[0] || '').toLowerCase().includes('exercise')
                        ? 'bg-pink/5 border-pink text-pink'
                        : 'bg-yellow/5 border-yellow text-yellow'
                    }
                  >
                    {TypeIcon && <TypeIcon className="w-5 h-5" />}
                    {t(aims[0] || '')}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {isPrivate && <FaLock aria-label={t('Private intervention')} />}
                <div
                  className="font-medium"
                  {...(isTranslated ? { title: `Original: ${rec.title}` } : {})}
                >
                  {title}
                </div>
                {isTranslated && (
                  <small className="text-chartMuted italic">
                    ({t('Translated from')}: {String(originalLang).toUpperCase()})
                  </small>
                )}
              </TableCell>
              <TableCell className="text-brand">
                <div className="flex items-center gap-1">
                  {MediaIcon ? <MediaIcon className="w-5 h-5" /> : <span className="w-5 h-5" />}
                  <span className="text-xs font-medium">{t(contentType)}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {allLangs.map((lang) => (
                    <Badge
                      key={lang}
                      variant="dashboard"
                      className={`${lang !== rec.language ? 'bg-chartMuted/20' : ''}`}
                    >
                      {lang.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <StarRating value={rec.avg_rating} showNumber />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="dashboard">
                      {t(tag)}
                    </Badge>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default InterventionList;
