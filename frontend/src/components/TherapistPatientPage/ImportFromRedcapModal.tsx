import React from 'react';
import { Modal, Button, Form, Spinner, Table, Badge, Alert } from 'react-bootstrap';

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
  warnings?: string[];

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
  onImportAll: () => void;
};

const redcapKey = (c: Candidate) => `${c.project}::${(c.identifier || '').trim()}`;

const ImportFromRedcapModal: React.FC<Props> = (props) => {
  const {
    show,
    onHide,
    loading,
    error,
    warnings = [],
    candidates: candidatesRaw,
    rowPasswords: rowPasswordsRaw,
    setRowPassword,
    importingKey,
    importedKeys: importedKeysRaw,
    onRefresh,
    onImportOne,
    onImportAll,
  } = props;

  // ✅ hard guards so the modal never crashes
  const candidates = Array.isArray(candidatesRaw) ? candidatesRaw : [];
  const rowPasswords =
    rowPasswordsRaw && typeof rowPasswordsRaw === 'object' ? rowPasswordsRaw : {};
  const importedKeys =
    importedKeysRaw && typeof importedKeysRaw === 'object' ? importedKeysRaw : {};

  const anyImporting = !!importingKey;

  const rowLabel = (c: Candidate) => {
    const hasPat = !!(c.pat_id || '').trim();
    // If no pat_id: show ONLY record_id (as requested)
    return hasPat ? String(c.pat_id) : `Record ${c.record_id || c.identifier || '—'}`;
  };

  const canImportRow = (c: Candidate) => {
    const key = redcapKey(c);
    if (!key) return false;
    if (importedKeys[key]) return false;
    if (importingKey === key) return false;
    const pw = (rowPasswords[key] || '').trim();
    return !!pw;
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" backdrop="static" keyboard={!anyImporting}>
      <Modal.Header closeButton={!anyImporting}>
        <Modal.Title>Import patients from REDCap</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button variant="primary" onClick={onRefresh} disabled={loading || anyImporting}>
              Refresh list
            </Button>

            <Badge bg="secondary">{candidates.length} found</Badge>
          </div>
        </div>

        {error ? <Alert variant="danger">{error}</Alert> : null}

        {warnings.length > 0 && (
          <Alert variant="warning">
            <strong>Some projects could not be queried:</strong>
            <ul className="mb-0 mt-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" role="status" />
            <div className="mt-2">Loading candidates…</div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-muted">No importable patients found for your clinic/projects.</div>
        ) : (
          <Table responsive hover className="align-middle">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Record ID</th>
                <th>Project</th>
                <th style={{ minWidth: 240 }}>Password</th>
                <th style={{ width: 140 }} className="text-end">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {candidates.map((c) => {
                const key = redcapKey(c);
                const imported = !!importedKeys[key];
                const isImporting = importingKey === key;

                const hasPat = !!(c.pat_id || '').trim();
                const patientCell = hasPat ? (
                  <span style={{ whiteSpace: 'nowrap' }}>{c.pat_id}</span>
                ) : (
                  <Badge bg="secondary">record only</Badge>
                );

                return (
                  <tr key={key} style={imported ? { opacity: 0.55 } : undefined}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {patientCell}
                      {c.dag ? (
                        <Badge bg="light" text="dark" className="ms-2">
                          DAG: {c.dag}
                        </Badge>
                      ) : null}
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>
                      <code>{c.record_id || c.identifier || '—'}</code>
                    </td>

                    <td>
                      <Badge bg="info">{c.project}</Badge>
                    </td>

                    <td>
                      <Form.Control
                        type="text"
                        value={rowPasswords[key] ?? ''} // ✅ controlled by store map
                        placeholder="TempPass123!"
                        disabled={imported || isImporting}
                        autoComplete="off"
                        onChange={(e) => setRowPassword(key, e.currentTarget.value)} // ✅ this must update the map
                      />
                      <Form.Text className="text-muted">
                        {hasPat
                          ? 'Password for this patient.'
                          : 'Password for this record-only patient.'}
                      </Form.Text>
                    </td>

                    <td className="text-end">
                      <Button
                        size="sm"
                        variant={imported ? 'secondary' : 'success'}
                        disabled={!canImportRow(c)}
                        onClick={() => onImportOne(c)}
                      >
                        {imported ? 'Imported' : isImporting ? 'Importing…' : 'Import'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={anyImporting}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ImportFromRedcapModal;
