// components/help/HelpCenter.tsx
import React from 'react';
import { Modal, Button, Nav } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import authStore from '../../stores/authStore'; // ⬅️ added

type V1Manifest = {
  version: 1;
  extensions: string[];
  languages: string[];
  assets: Record<string, { basePath: string }>;
  keys: string[];
  displayOrder?: string[];
};

const MANIFEST_URL = '/help/help-manifest.json';
const BASE_PATH = '/help';

const fetchManifest = async (): Promise<V1Manifest> => {
  const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  const data = (await res.json()) as V1Manifest;
  if (!data || data.version !== 1) throw new Error('Unsupported help manifest format (expected version 1).');
  return data;
};

const joinUrl = (...parts: string[]) =>
  parts
    .map((p) => String(p || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
    .replace(/^/, '/');

const pretty = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

const extVariants = (ext: string) => {
  const e = ext.startsWith('.') ? ext.slice(1) : ext;
  return [e.toLowerCase(), e.toUpperCase()];
};

const titleFromKey = (k: string) => {
  const parts = k.split('.');
  const start = parts[0] === 'Instructions' ? 1 : 0;
  return pretty(parts.slice(start).join(' • '));
};

type GroupName = 'common' | 'therapist' | 'patient';

const detectGroup = (key: string): GroupName =>
  key.includes('.therapist.') ? 'therapist' : key.includes('.patient.') ? 'patient' : 'common';

// For therapist/patient, subgroup is the next segment after that; for common, the next after "Instructions"
const detectSubgroup = (key: string, group: GroupName) => {
  const parts = key.split('.');
  if (group === 'therapist' || group === 'patient') {
    const i = parts.indexOf(group);
    return parts[i + 1] || 'general';
  }
  const i = parts.indexOf('Instructions');
  return parts[i + 1] || 'general';
};

// Build label *without* group and subgroup prefixes so you see just the tail like “Info”, “Add”, etc.
const labelWithoutGroup = (key: string, group: GroupName, subgroup: string) => {
  const parts = key.split('.');
  let start = 0;
  if (parts[0] === 'Instructions') start = 1;
  const gIdx = parts.indexOf(group);
  if (gIdx >= 0 && gIdx >= start) start = gIdx + 1;
  const sgIdx = parts.indexOf(subgroup, start);
  if (sgIdx >= 0) start = sgIdx + 1;
  const remainder = parts.slice(start);
  return pretty(remainder.join(' • ')) || pretty(subgroup);
};

// Try therapist/patient key first, then the “common” key with same tail
const fallbackKeyCandidates = (key: string): string[] => {
  const parts = key.split('.');
  const idxTher = parts.indexOf('therapist');
  const idxPat = parts.indexOf('patient');

  if (idxTher > -1 || idxPat > -1) {
    const idx = Math.max(idxTher, idxPat);
    const commonParts = parts.slice(0, idx).concat(parts.slice(idx + 1));
    return [key, commonParts.join('.')];
  }
  return [key]; // already common
};

const HelpCenter: React.FC<{
  open: boolean;
  onClose: () => void;
  defaultKey?: string;
}> = ({ open, onClose, defaultKey }) => {
  const { i18n, t } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);

  // 🔒 who is viewing?
  const roleFromStore = authStore?.userType;
  const roleFromStorage = (typeof window !== 'undefined' && localStorage.getItem('userType')) || '';
  const userRole = roleFromStore || roleFromStorage || '';
  const isTherapist = userRole === 'Therapist';

  const [manifest, setManifest] = React.useState<V1Manifest | null>(null);
  const [activeGroup, setActiveGroup] = React.useState<GroupName>('common');
  const [activeSubgroup, setActiveSubgroup] = React.useState<string>('general');
  const [activeKey, setActiveKey] = React.useState<string | undefined>(undefined);

  const [imgTryIndex, setImgTryIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  // helper to check if a key is allowed for this viewer
  const isKeyAllowed = React.useCallback(
    (key: string) => {
      const g = detectGroup(key);
      if (g === 'therapist' && !isTherapist) return false;
      return true;
    },
    [isTherapist]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) return;
      try {
        setError(null);
        const m = await fetchManifest();
        if (cancelled) return;

        // filter out therapist keys if not allowed
        const allowedKeys = m.keys.filter(isKeyAllowed);
        const allowedOrder =
          (Array.isArray(m.displayOrder) && m.displayOrder.length
            ? m.displayOrder.filter(isKeyAllowed)
            : allowedKeys) ?? [];

        const safeManifest: V1Manifest = {
          ...m,
          keys: allowedKeys,
          displayOrder: allowedOrder
        };

        setManifest(safeManifest);

        // choose a safe initial key
        const order = allowedOrder.length ? allowedOrder : allowedKeys;
        let initialKey =
          defaultKey && isKeyAllowed(defaultKey) && order.includes(defaultKey)
            ? defaultKey
            : order[0];

        // Guard if nothing allowed
        if (!initialKey) {
          setActiveKey(undefined);
          return;
        }

        const g = detectGroup(initialKey);
        const sg = detectSubgroup(initialKey, g);
        setActiveGroup(g);
        setActiveSubgroup(sg);
        setActiveKey(initialKey);
        setImgTryIndex(0);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load help manifest.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultKey, isKeyAllowed]);

  const order = React.useMemo<string[]>(() => {
    if (!manifest) return [];
    return (Array.isArray(manifest.displayOrder) && manifest.displayOrder.length
      ? manifest.displayOrder
      : manifest.keys) ?? [];
  }, [manifest]);

  const grouped = React.useMemo<Record<GroupName, string[]>>(() => {
    const g: Record<GroupName, string[]> = { common: [], therapist: [], patient: [] };
    for (const k of order) g[detectGroup(k)].push(k);
    // if non-therapist, therapist list is already empty (filtered above)
    return g;
  }, [order]);

  const subgroups = React.useMemo<Record<GroupName, Record<string, string[]>>>(() => {
    const out: Record<GroupName, Record<string, string[]>> = { common: {}, therapist: {}, patient: {} };
    (Object.keys(grouped) as GroupName[]).forEach((g) => {
      grouped[g].forEach((k) => {
        const sg = detectSubgroup(k, g);
        (out[g][sg] ||= []).push(k);
      });
    });
    return out;
  }, [grouped]);

  React.useEffect(() => {
    const allSG = Object.keys(subgroups[activeGroup] || {});
    if (!allSG.length) return;
    if (!allSG.includes(activeSubgroup)) {
      const firstSG = allSG[0];
      setActiveSubgroup(firstSG);
      const firstKey = subgroups[activeGroup][firstSG]?.[0];
      if (firstKey) setActiveKey(firstKey);
    }
  }, [activeGroup, activeSubgroup, subgroups]);

  const keysInCurrentSubgroup = React.useMemo(() => {
    return subgroups[activeGroup]?.[activeSubgroup] ?? [];
  }, [subgroups, activeGroup, activeSubgroup]);

  // Build image candidates (with common-key fallback)
  const imgCandidates = React.useMemo<string[]>(() => {
    if (!manifest || !activeKey) return [];
    const exts = (manifest.extensions?.length ? manifest.extensions : ['jpg', 'jpeg', 'webp'])!;
    const langFolder = manifest.assets?.[lang]?.basePath || lang;
    const enFolder = manifest.assets?.['en']?.basePath || 'en';

    const keysToTry = fallbackKeyCandidates(activeKey);
    const urls: string[] = [];

    keysToTry.forEach((k) => {
      exts.forEach((ext) => {
        extVariants(ext).forEach((v) => {
          urls.push(joinUrl(BASE_PATH, langFolder, `${k}.${v}`));
        });
      });
      exts.forEach((ext) => {
        extVariants(ext).forEach((v) => {
          urls.push(joinUrl(BASE_PATH, enFolder, `${k}.${v}`));
        });
      });
    });

    return urls;
  }, [manifest, activeKey, lang]);

  React.useEffect(() => {
    setImgTryIndex(0);
  }, [activeKey, lang, manifest]);

  const onImgError = () => {
    setImgTryIndex((i) => (i < imgCandidates.length - 1 ? i + 1 : i));
  };

  const handleSelectGroup = (g: GroupName) => {
    // prevent selecting therapist group if not allowed
    if (g === 'therapist' && !isTherapist) return;
    setActiveGroup(g);
    const sgMap = subgroups[g] || {};
    const firstSG = Object.keys(sgMap)[0];
    if (firstSG) {
      setActiveSubgroup(firstSG);
      const firstKey = sgMap[firstSG]?.[0];
      if (firstKey) setActiveKey(firstKey);
    } else {
      // no items in that group
      setActiveSubgroup('general');
      setActiveKey(undefined);
    }
  };

  const handleSelectSubgroup = (sg?: string | null) => {
    if (!sg) return;
    setActiveSubgroup(sg);
    const firstKey = subgroups[activeGroup]?.[sg]?.[0];
    if (firstKey) setActiveKey(firstKey);
  };

  const handleSelectKey = (k?: string | null) => {
    if (!k) return;
    if (!isKeyAllowed(k)) return; // extra guard
    setActiveKey(k);
  };

  if (!open) return null;

  if (error) {
    return (
      <Modal show onHide={onClose} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Help')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-danger">{error}</Modal.Body>
      </Modal>
    );
  }

  if (!manifest || !activeKey) {
    return (
      <Modal show onHide={onClose} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Help')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>{t('Loading...')}</Modal.Body>
      </Modal>
    );
  }

  const currentSrc = imgCandidates[imgTryIndex];
  const resolvedTitle = t(activeKey) !== activeKey ? t(activeKey) : titleFromKey(activeKey);

  const showSubgroups = activeGroup !== 'common';
  const subgroupEntries = Object.entries(subgroups[activeGroup] || {});

  return (
    <Modal show onHide={onClose} size="xl" centered dialogClassName="help-center-modal">
      <Modal.Header closeButton>
        <Modal.Title>{t('Help')} — {resolvedTitle}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Top groups — Therapist tab is hidden unless the viewer is a therapist */}
        <Nav
          variant="pills"
          activeKey={activeGroup}
          onSelect={(k) => handleSelectGroup((k as GroupName) || activeGroup)}
          className="mb-3"
        >
          <Nav.Item><Nav.Link eventKey="common">{t('Common')}</Nav.Link></Nav.Item>
          {isTherapist && (
            <Nav.Item><Nav.Link eventKey="therapist">{t('Therapist')}</Nav.Link></Nav.Item>
          )}
          <Nav.Item><Nav.Link eventKey="patient">{t('Patient')}</Nav.Link></Nav.Item>
        </Nav>

        {/* Subgroups (only therapist/patient) */}
        {showSubgroups && subgroupEntries.length > 0 && (
          <Nav variant="tabs" activeKey={activeSubgroup} onSelect={handleSelectSubgroup} className="mb-2">
            {subgroupEntries.map(([sg]) => (
              <Nav.Item key={sg}>
                <Nav.Link eventKey={sg}>{t(pretty(sg))}</Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
        )}

        {/* Keys within current (sub)group */}
        <Nav variant="tabs" activeKey={activeKey} onSelect={handleSelectKey}>
          {(showSubgroups ? keysInCurrentSubgroup : grouped[activeGroup]).map((k) => {
            const sg = detectSubgroup(k, activeGroup);
            const label = showSubgroups
              ? labelWithoutGroup(k, activeGroup, sg)
              : (t(k) !== k ? t(k) : titleFromKey(k));
            return (
              <Nav.Item key={k}>
                <Nav.Link eventKey={k}>{t(label)}</Nav.Link>
              </Nav.Item>
            );
          })}
        </Nav>

        {/* Slide */}
        <div className="d-flex flex-column align-items-center mt-3">
          <div className="help-slide-wrapper">
            {currentSrc ? (
              <img src={currentSrc} alt={activeKey} onError={onImgError} className="help-slide" />
            ) : (
              <div className="text-muted">
                {t('No image available.')}
              </div>
            )}
          </div>

        {/* Pager (single-page for now) */}
          <div className="d-flex align-items-center gap-2 mt-2">
            <Button size="sm" variant="outline-secondary" disabled>{t('Previous')}</Button>
            <span className="text-muted">1 / 1</span>
            <Button size="sm" variant="outline-secondary" disabled>{t('Next')}</Button>
            {currentSrc && (
              <a className="ms-3" href={currentSrc} download target="_blank" rel="noreferrer">
                {t('Download Image')}
              </a>
            )}
          </div>
        </div>
      </Modal.Body>

      <style>{`
        .help-center-modal .modal-body { max-height: 75vh; overflow: auto; }
        .help-slide-wrapper { width: 100%; text-align: center; }
        .help-slide { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
      `}</style>
    </Modal>
  );
};

export default HelpCenter;
