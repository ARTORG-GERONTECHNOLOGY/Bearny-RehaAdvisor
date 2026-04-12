// common/InterventionLangPill.tsx
import React, { useMemo } from 'react';
import { Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

type Props = {
  item: { _id: string; language?: string; available_languages?: string[] };
  onOpenDetail: (id: string) => void;
};

export const InterventionLangPill: React.FC<Props> = ({ item, onOpenDetail }) => {
  const { t } = useTranslation();
  const current = (item.language || '').toUpperCase();
  const others = useMemo(() => {
    const all = Array.isArray(item.available_languages) ? item.available_languages : [];
    return all.map((x) => String(x).toUpperCase()).filter((x) => x && x !== current);
  }, [item.available_languages, current]);

  const hint = others.length ? others.join(', ') : '—';

  return (
    <div className="d-flex align-items-center gap-1">
      {current ? <Badge bg="secondary">{current}</Badge> : null}

      <OverlayTrigger
        placement="top"
        overlay={
          <Tooltip>
            {others.length ? `${t('Other languages')}: ${hint}` : t('No other languages')}
          </Tooltip>
        }
      >
        <span
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail(item._id)}
          onKeyDown={(e) => (e.key === 'Enter' ? onOpenDetail(item._id) : null)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          aria-label={t('Open language options')}
        >
          🌐
        </span>
      </OverlayTrigger>
    </div>
  );
};
