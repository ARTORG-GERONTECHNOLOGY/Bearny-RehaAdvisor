import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export type Candidate = {
  project: string;
  record_id?: string;
  pat_id?: string;
  identifier: string; // BE fallback key (pat_id if present else record_id)
  dag?: string;
};

type Props = {
  show: boolean;
  onHide: () => void;

  loading: boolean;
  error: string;

  candidates: Candidate[];

  // per-row password state
  rowPasswords: Record<string, string>;
  setRowPassword: (key: string, value: string) => void;

  // import state
  importingKey: string | null;
  importedKeys: Record<string, boolean>;

  // actions
  onRefresh: () => void;
  onImportOne: (c: Candidate) => void;
};

const redcapKey = (c: Candidate) => `${c.project}::${(c.identifier || '').trim()}`;

const ImportFromRedcapModal: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const {
    show,
    onHide,
    loading,
    error,
    candidates: candidatesRaw,
    rowPasswords: rowPasswordsRaw,
    setRowPassword,
    importingKey,
    importedKeys: importedKeysRaw,
    onRefresh,
    onImportOne,
  } = props;

  // ✅ hard guards so the modal never crashes
  const candidates = Array.isArray(candidatesRaw) ? candidatesRaw : [];
  const rowPasswords =
    rowPasswordsRaw && typeof rowPasswordsRaw === 'object' ? rowPasswordsRaw : {};
  const importedKeys =
    importedKeysRaw && typeof importedKeysRaw === 'object' ? importedKeysRaw : {};

  const anyImporting = !!importingKey;

  const canImportRow = (c: Candidate) => {
    const key = redcapKey(c);
    if (!key) return false;
    if (importedKeys[key]) return false;
    if (importingKey === key) return false;
    const pw = (rowPasswords[key] || '').trim();
    return !!pw;
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && !anyImporting && onHide()}>
      <DialogContent
        className="max-w-3xl"
        hideClose={anyImporting}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('Import patients from REDCap')}</DialogTitle>
        </DialogHeader>

        <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button size="dashboard" onClick={onRefresh} disabled={loading || anyImporting}>
              {t('Refresh list')}
            </Button>

            <Badge variant="dashboard">
              {candidates.length} {t('found')}
            </Badge>
          </div>
        </div>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {loading ? (
          <div className="text-center py-4">
            <Spinner />
            <div className="mt-2">{t('Loading candidates…')}</div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-muted">
            {t('No importable patients found for your clinic/projects.')}
          </div>
        ) : (
          <Table className="align-middle">
            <TableHeader>
              <TableRow>
                <TableHead>{t('Patient')}</TableHead>
                <TableHead>{t('Record ID')}</TableHead>
                <TableHead>{t('Project')}</TableHead>
                <TableHead style={{ minWidth: 240 }}>{t('Password')}</TableHead>
                <TableHead style={{ width: 140 }} className="text-end">
                  {t('Action')}
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {candidates.map((c) => {
                const key = redcapKey(c);
                const imported = !!importedKeys[key];
                const isImporting = importingKey === key;

                const hasPat = !!(c.pat_id || '').trim();
                const patientCell = hasPat ? (
                  <span style={{ whiteSpace: 'nowrap' }}>{c.pat_id}</span>
                ) : (
                  <Badge variant="dashboard">{t('record only')}</Badge>
                );

                return (
                  <TableRow key={key} style={imported ? { opacity: 0.55 } : undefined}>
                    <TableCell style={{ whiteSpace: 'nowrap' }}>
                      {patientCell}
                      {c.dag ? (
                        <Badge variant="dashboard" className="ms-2">
                          DAG: {c.dag}
                        </Badge>
                      ) : null}
                    </TableCell>

                    <TableCell style={{ whiteSpace: 'nowrap' }}>
                      <code>{c.record_id || c.identifier || '—'}</code>
                    </TableCell>

                    <TableCell>
                      <Badge variant="dashboard-info">{c.project}</Badge>
                    </TableCell>

                    <TableCell>
                      <Input
                        type="text"
                        value={rowPasswords[key] ?? ''} // ✅ controlled by store map
                        placeholder="TempPass123!"
                        disabled={imported || isImporting}
                        autoComplete="off"
                        onChange={(e) => setRowPassword(key, e.currentTarget.value)} // ✅ this must update the map
                      />
                      <p className="text-muted-foreground text-sm">
                        {hasPat
                          ? t('Password for this patient.')
                          : t('Password for this record-only patient.')}
                      </p>
                    </TableCell>

                    <TableCell className="text-end">
                      <Button
                        size="dashboard"
                        variant={imported ? 'secondary' : undefined}
                        disabled={!canImportRow(c)}
                        onClick={() => onImportOne(c)}
                      >
                        {imported ? t('Imported') : isImporting ? t('Importing...') : t('Import')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onHide} disabled={anyImporting}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportFromRedcapModal;
