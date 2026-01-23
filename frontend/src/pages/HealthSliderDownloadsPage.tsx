import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner, Table } from 'react-bootstrap';
import apiClient from '../api/client';

type Item = {
  id: string;
  participantId: string;
  sessionId: string;
  questionIndex: number;
  answerValue: number | null;
  hasAudio: boolean;
  audioName?: string | null;
  answeredAt?: string | null;
};

type ListResp = { items: Item[] };

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function HealthSliderDownloadsPage() {
  const [participantId, setParticipantId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const stats = useMemo(() => {
    const total = items.length;
    const withAudio = items.filter((i) => i.hasAudio).length;
    const sessions = new Set(items.map((i) => i.sessionId)).size;
    return { total, withAudio, sessions };
  }, [items]);

  const fetchItems = async () => {
    setError(''); setInfo(''); setItems([]);
    const pid = participantId.trim();
    if (!pid) return setError('Please enter a participant ID.');

    setLoading(true);
    try {
      const res = await apiClient.get<ListResp>('/healthslider/items/', {
        params: { participantId: pid, sessionId: sessionId.trim() || undefined },
      });
      const arr = Array.isArray(res.data?.items) ? res.data.items : [];
      setItems(arr);
      if (!arr.length) setInfo('No recordings found for this participant/session.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load recordings.');
    } finally { setLoading(false); }
  };

  const downloadOne = async (item: Item) => {
    try {
      const res = await apiClient.get(`/healthslider/audio/${item.id}/`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = item.audioName || `q${item.questionIndex}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Download failed.'); }
  };

const downloadZip = async () => {
  const pid = participantId.trim();
  if (!pid) return;

  setLoading(true);
  setError('');

  try {
    // 1. Fetch the data as a 'blob'
    const res = await apiClient.get('/healthslider/session-zip/', {
      params: {
        participantId: pid,
        sessionId: sessionId.trim() || undefined,
      },
      responseType: 'blob', // IMPORTANT: Tells the browser this is binary data
    });

    // 2. Create a local URL representing that data
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
    
    // 3. Create a hidden <a> tag and "click" it
    const link = document.createElement('a');
    link.href = url;
    
    // Set the filename for the user's computer
    const fileName = `Session_${pid}_${new Date().toISOString().split('T')[0]}.zip`;
    link.setAttribute('download', fileName);
    
    document.body.appendChild(link);
    link.click();

    // 4. Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (e: any) {
    setError('Failed to generate or download ZIP.');
  } finally {
    setLoading(false);
  }
};

  const deleteSession = async () => {
    const pid = participantId.trim();
    const sid = sessionId.trim();
    const msg = sid 
      ? `Are you SURE you want to delete session "${sid}"? All audio files and data will be permanently lost.`
      : `Are you SURE you want to delete ALL sessions for participant "${pid}"? This is permanent.`;

    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      await apiClient.delete('/healthslider/delete-session/', {
        params: { participantId: pid, sessionId: sid || undefined }
      });
      setItems([]);
      setInfo('Successfully deleted.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete.');
    } finally { setLoading(false); }
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Container className="mt-4 mb-5">
        <Row className="justify-content-center">
          <Col lg={10} xl={9}>
            <Card className="shadow-sm">
              <Card.Body>
                <h3 className="mb-2">HealthSlider Recordings Download</h3>
                <p className="text-muted mb-4">Manage and download recorded participant sessions.</p>

                {error && <Alert variant="danger">{error}</Alert>}
                {info && <Alert variant="info">{info}</Alert>}

                <Row className="g-3 align-items-end">
                  <Col md={6}>
                    <Form.Label className="fw-semibold">Participant ID</Form.Label>
                    <Form.Control value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="e.g. SUBJ_001" />
                  </Col>
                  <Col md={6}>
                    <Form.Label className="fw-semibold">Session ID (optional)</Form.Label>
                    <Form.Control value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="e.g. Session Timestamp" />
                  </Col>
                  <Col xs={12} className="d-flex gap-2">
                    <Button onClick={fetchItems} disabled={loading}>{loading ? <Spinner size="sm" /> : 'Search'}</Button>
                    <Button variant="outline-primary" disabled={!items.length} onClick={downloadZip}>Download all (ZIP)</Button>
                    <Button variant="outline-danger" disabled={!items.length} onClick={deleteSession}>Delete All</Button>
                    <Button variant="outline-secondary" onClick={() => { setParticipantId(''); setSessionId(''); setItems([]); setError(''); setInfo(''); }}>Clear</Button>
                  </Col>
                </Row>

                {!!items.length && (
                  <div className="mt-4 text-muted small">
                    Found <b>{stats.total}</b> items across <b>{stats.sessions}</b> sessions. Audio files: <b>{stats.withAudio}</b>
                  </div>
                )}

                <div className="mt-3" style={{ overflowX: 'auto' }}>
                  <Table striped bordered hover responsive className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Q#</th>
                        <th>Session</th>
                        <th style={{ width: 100 }}>Answer</th>
                        <th style={{ width: 180 }}>Saved</th>
                        <th style={{ width: 200 }}>Audio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.questionIndex + 1}</td>
                          <td className="small text-break">{it.sessionId}</td>
                          <td>{it.answerValue ?? '—'}</td>
                          <td>{fmtDate(it.answeredAt)}</td>
                          <td>
                            {it.hasAudio ? (
                              <Button size="sm" variant="primary" onClick={() => downloadOne(it)}>Download</Button>
                            ) : <span className="text-muted">No audio</span>}
                          </td>
                        </tr>
                      ))}
                      {!loading && !items.length && (
                        <tr><td colSpan={5} className="text-center text-muted py-4">No data loaded.</td></tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}