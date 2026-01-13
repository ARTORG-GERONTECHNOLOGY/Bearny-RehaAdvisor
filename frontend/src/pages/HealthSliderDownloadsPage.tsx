// src/pages/HealthSliderDownloadsPage.tsx
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
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function HealthSliderDownloadsPage() {
  const [participantId, setParticipantId] = useState('');
  const [sessionId, setSessionId] = useState('');

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // convenient derived counts
  const stats = useMemo(() => {
    const total = items.length;
    const withAudio = items.filter((i) => i.hasAudio).length;
    const noAudio = total - withAudio;
    const sessions = new Set(items.map((i) => i.sessionId)).size;
    return { total, withAudio, noAudio, sessions };
  }, [items]);

  const fetchItems = async () => {
    setError('');
    setInfo('');
    setItems([]);

    const pid = participantId.trim();
    if (!pid) {
      setError('Please enter a participant ID.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.get<ListResp>('/healthslider/items/', {
        params: {
          participantId: pid,
          sessionId: sessionId.trim() || undefined,
        },
      });

      const arr = Array.isArray(res.data?.items) ? res.data.items : [];
      setItems(arr);

      if (!arr.length) {
        setInfo('No recordings found for this participant/session.');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load recordings.');
    } finally {
      setLoading(false);
    }
  };

  // Download helper (forces download by fetching blob)
  const downloadOne = async (item: Item) => {
    setError('');
    try {
      const res = await apiClient.get(`/healthslider/audio/${item.id}/`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);

      const name =
        item.audioName ||
        `participant_${item.participantId}_session_${item.sessionId}_q${String(item.questionIndex).padStart(2, '0')}.webm`;

      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Download failed.');
    }
  };

  // Optional: Download all as ZIP (only works if you implement endpoint)
  const downloadZip = () => {
    const pid = participantId.trim();
    if (!pid) return;

    const params = new URLSearchParams();
    params.set('participantId', pid);
    if (sessionId.trim()) params.set('sessionId', sessionId.trim());

    // This will download if server sets Content-Disposition: attachment
    window.open(`/api/healthslider/session-zip/?${params.toString()}`, '_blank');
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Container className="mt-4 mb-5">
        <Row className="justify-content-center">
          <Col lg={10} xl={9}>
            <Card className="shadow-sm">
              <Card.Body>
                <h3 className="mb-2">HealthSlider Recordings Download</h3>
                <p className="text-muted mb-4">
                  Enter the <b>participant ID</b> (user-provided) and optionally a <b>session ID</b> to list and download recordings.
                </p>

                {error && <Alert variant="danger">{error}</Alert>}
                {info && <Alert variant="info">{info}</Alert>}

                <Row className="g-3 align-items-end">
                  <Col md={6}>
                    <Form.Label className="fw-semibold">Participant ID</Form.Label>
                    <Form.Control
                      value={participantId}
                      onChange={(e) => setParticipantId(e.target.value)}
                      placeholder="e.g. SUBJ_001"
                    />
                    <div className="form-text">
                      This is the ID typed by the participant (not from DB user id).
                    </div>
                  </Col>

                  <Col md={6}>
                    <Form.Label className="fw-semibold">Session ID (optional)</Form.Label>
                    <Form.Control
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      placeholder="e.g. 2026-01-12T09-30-00"
                    />
                    <div className="form-text">
                      Leave empty to list all sessions for the participant.
                    </div>
                  </Col>

                  <Col xs={12} className="d-flex gap-2">
                    <Button onClick={fetchItems} disabled={loading}>
                      {loading ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Loading…
                        </>
                      ) : (
                        'Search'
                      )}
                    </Button>

                    <Button
                      variant="outline-secondary"
                      disabled={loading}
                      onClick={() => {
                        setParticipantId('');
                        setSessionId('');
                        setItems([]);
                        setError('');
                        setInfo('');
                      }}
                    >
                      Clear
                    </Button>

                    <Button
                      variant="outline-primary"
                      disabled={!items.length}
                      onClick={downloadZip}
                      title="Requires a backend ZIP endpoint"
                    >
                      Download all (ZIP)
                    </Button>
                  </Col>
                </Row>

                {/* Stats */}
                {!!items.length && (
                  <div className="mt-4 text-muted">
                    Found <b>{stats.total}</b> items across <b>{stats.sessions}</b> session(s).{' '}
                    Audio: <b>{stats.withAudio}</b> / Missing: <b>{stats.noAudio}</b>
                  </div>
                )}

                {/* List */}
                <div className="mt-3" style={{ overflowX: 'auto' }}>
                  <Table striped bordered hover responsive className="mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Q#</th>
                        <th>Session</th>
                        <th style={{ width: 130 }}>Answer</th>
                        <th style={{ width: 180 }}>Saved</th>
                        <th style={{ width: 260 }}>Audio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.questionIndex + 1}</td>
                          <td className="text-break">{it.sessionId}</td>
                          <td>{it.answerValue == null ? '—' : it.answerValue}</td>
                          <td>{fmtDate(it.answeredAt)}</td>
                          <td>
                            {it.hasAudio ? (
                              <div className="d-flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => downloadOne(it)}
                                >
                                  Download
                                </Button>

                                {/* optional: open in new tab */}
                                <Button
                                  size="sm"
                                  variant="outline-secondary"
                                  onClick={() =>
                                    window.open(`/api/healthslider/audio/${it.id}/`, '_blank')
                                  }
                                >
                                  Open
                                </Button>

                                <span className="text-muted small text-break">
                                  {it.audioName || ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted">No audio</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {!loading && !items.length && (
                        <tr>
                          <td colSpan={5} className="text-center text-muted py-4">
                            No results yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>

                <div className="mt-3 text-muted small">
                  Tip: If downloads open in a new tab instead of downloading, ensure your backend sets
                  <code className="ms-1">Content-Disposition: attachment</code>.
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
