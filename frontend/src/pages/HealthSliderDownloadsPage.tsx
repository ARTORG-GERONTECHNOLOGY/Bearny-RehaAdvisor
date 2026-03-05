/**
 * ICF Monitor — researcher downloads page  (/healthslider-downloads)
 *
 * Auth gate (standalone 2FA — no relation to main app therapist/admin login)
 * --------------------------------------------------------------------------
 * Step 1 – Password + email
 *   POST /api/healthslider/auth/
 *   The researcher enters the shared HEALTHSLIDER_DOWNLOAD_PASSWORD and their
 *   email address.  The backend validates the password and emails a 6-digit
 *   code to that address.
 *
 * Step 2 – Code entry
 *   POST /api/healthslider/auth/verify/
 *   The researcher enters the code.  On success the backend returns a signed
 *   8-hour token (django.core.signing, salt "healthslider_dl").
 *   The token is stored in sessionStorage so it is automatically cleared when
 *   the browser tab is closed.
 *
 * All data-fetch requests carry the token in the X-Healthslider-Token header.
 * A Logout button removes the token and returns the user to the login gate.
 *
 * Features (once authenticated)
 * ------------------------------
 * - Search answers by Patient ID (format Pxx)
 *   GET /api/healthslider/items/?participantId=Pxx
 * - In-browser audio playback per question (lazy-loaded on demand)
 *   GET /api/healthslider/audio/<id>/
 * - "Download All (ZIP + CSV)" — assembles a ZIP client-side via fflate:
 *     audio files (fetched one-by-one) + a CSV summary with ratings and timestamps.
 */

import React, { useState } from 'react';
import { Button, Table, Spinner, Container, Row, Col, Form } from 'react-bootstrap';
import { zipSync, strToU8 } from 'fflate';
import axios from 'axios';
import apiClient from '../api/client';

export default function DownloadsPage() {
  // --- auth gate ---
  const [hlsToken, setHlsToken] = useState(
    () => sessionStorage.getItem('healthslider_token') || ''
  );
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // --- downloads state ---
  const [participantId, setParticipantId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const authHeaders = () => ({ 'X-Healthslider-Token': hlsToken });

  const submitPassword = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      await axios.post('/api/healthslider/auth/', { password: authPassword, email: authEmail });
      setStep('code');
    } catch (e: any) {
      setAuthError(e?.response?.data?.error || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const submitCode = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await axios.post('/api/healthslider/auth/verify/', { code: authCode });
      sessionStorage.setItem('healthslider_token', res.data.token);
      setHlsToken(res.data.token);
    } catch (e: any) {
      setAuthError(e?.response?.data?.error || 'Invalid code');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem('healthslider_token');
    setHlsToken('');
    setStep('password');
    setAuthEmail('');
    setAuthPassword('');
    setAuthCode('');
  };

  const fetchItems = async () => {
    if (!participantId.trim()) return alert('Please enter a Patient ID');
    setLoading(true);
    try {
      const res = await apiClient.get(`/healthslider/items/`, {
        params: { participantId: participantId.trim() },
        headers: authHeaders(),
      });
      setItems(res.data.items || []);
      setAudioUrls({});
    } catch {
      alert('Error fetching data');
    }
    setLoading(false);
  };

  /** ✅ Robust audio load */
  const loadAudio = async (itemId: string) => {
    if (audioUrls[itemId]) return;
    try {
      const res = await apiClient.get(`/healthslider/audio/${itemId}/`, {
        responseType: 'arraybuffer',
        headers: authHeaders(),
      });
      const ct = (res.headers?.['content-type'] as string) || 'audio/webm';
      const blob = new Blob([res.data], { type: ct });
      const url = URL.createObjectURL(blob);
      setAudioUrls((prev) => ({ ...prev, [itemId]: url }));
    } catch {
      alert('Playback failed to load.');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const downloadAll = async () => {
    if (!items.length) return;
    setLoading(true);

    const zipData: Record<string, Uint8Array> = {};
    const dateStr = new Date().toISOString().split('T')[0];

    const csvRows = [['QuestionID', 'QuestionText', 'Rating', 'Timestamp', 'AudioFile']];

    for (const item of items) {
      const fileName = item.audioName || `Q${item.questionIndex + 1}_${participantId}.webm`;
      csvRows.push([
        String(item.questionIndex + 1),
        `"${(item.questionText || '').replace(/"/g, '""')}"`,
        item.answerValue === -1 ? 'N/A' : String(item.answerValue),
        item.answeredAt || '',
        item.hasAudio ? fileName : 'No Audio',
      ]);

      if (item.hasAudio) {
        try {
          const audioRes = await apiClient.get(`/healthslider/audio/${item.id}/`, {
            responseType: 'arraybuffer',
            headers: authHeaders(),
          });
          zipData[fileName] = new Uint8Array(audioRes.data);
        } catch (e) {
          console.error('Audio download failed', item.id, e);
        }
      }
    }

    zipData[`Summary_${participantId}_${dateStr}.csv`] = strToU8(
      csvRows.map((r) => r.join(',')).join('\n')
    );

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICF_Monitor_Export_${participantId}_${dateStr}.zip`;
    a.click();

    setLoading(false);
  };

  if (!hlsToken) {
    return (
      <Container
        className="py-5"
        style={{ maxWidth: 480, fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
      >
        <h3 className="mb-4">ICF Monitor — Secure Access</h3>
        {step === 'password' ? (
          <>
            <Form.Group className="mb-3">
              <Form.Label>Email address (to receive code)</Form.Label>
              <Form.Control
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="researcher@example.com"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Download password</Form.Label>
              <Form.Control
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
              />
            </Form.Group>
            {authError && <p className="text-danger mb-3">{authError}</p>}
            <Button onClick={submitPassword} disabled={authLoading}>
              {authLoading ? <Spinner size="sm" /> : 'Send code'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted">
              A 6-digit code was sent to <strong>{authEmail}</strong>. Check your inbox.
            </p>
            <Form.Group className="mb-3">
              <Form.Label>Verification code</Form.Label>
              <Form.Control
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                maxLength={6}
                style={{ letterSpacing: '0.3em', fontSize: '1.4rem', textAlign: 'center' }}
                autoFocus
              />
            </Form.Group>
            {authError && <p className="text-danger mb-3">{authError}</p>}
            <Button onClick={submitCode} disabled={authLoading} className="me-2">
              {authLoading ? <Spinner size="sm" /> : 'Verify'}
            </Button>
            <Button variant="outline-secondary" onClick={() => setStep('password')}>
              Back
            </Button>
          </>
        )}
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ fontFamily: 'Atkinson Hyperlegible, sans-serif' }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h3 className="mb-0">Admin Dashboard (V2.2)</h3>
        <Button variant="outline-danger" size="sm" onClick={logout}>
          Logout
        </Button>
      </div>
      <Row className="mb-4 align-items-end">
        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold">Patient ID (Format: Pxx)</Form.Label>
            <Form.Control
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="e.g. P01"
            />
          </Form.Group>
        </Col>
        <Col>
          <Button onClick={fetchItems} variant="primary" className="me-2 px-4 shadow-sm">
            Search
          </Button>
          <Button
            variant="success"
            onClick={downloadAll}
            disabled={!items.length || loading}
            className="px-4 shadow-sm"
          >
            {loading ? <Spinner size="sm" /> : 'Download All (ZIP + CSV)'}
          </Button>
        </Col>
      </Row>

      <Table striped bordered hover responsive className="mt-2 align-middle">
        <thead className="table-dark">
          <tr>
            <th className="text-center">Q#</th>
            <th>Question & Timestamp</th>
            <th className="text-center">Rating</th>
            <th className="text-center">Audio Size</th>
            <th style={{ width: '320px' }}>Playback</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="text-center fw-bold">{it.questionIndex + 1}</td>
              <td>
                <div className="fw-semibold">{it.questionText}</div>
                <small className="text-muted">
                  {it.answeredAt ? new Date(it.answeredAt).toLocaleString('de-DE') : ''}
                </small>
              </td>
              <td className="text-center">
                {it.answerValue === -1 ? (
                  <span className="badge bg-secondary">N/A</span>
                ) : (
                  <span className="badge bg-primary" style={{ fontSize: '1rem' }}>
                    {it.answerValue}
                  </span>
                )}
              </td>
              <td className="text-center text-muted small">
                {it.hasAudio ? formatSize(it.audioSize) : '—'}
              </td>
              <td>
                {it.hasAudio ? (
                  audioUrls[it.id] ? (
                    <audio
                      src={audioUrls[it.id]}
                      controls
                      style={{ height: '35px', width: '100%' }}
                    />
                  ) : (
                    <Button size="sm" variant="outline-dark" onClick={() => loadAudio(it.id)}>
                      ▶ Load Recording
                    </Button>
                  )
                ) : (
                  <span className="text-danger small">No recording available</span>
                )}
              </td>
            </tr>
          ))}

          {items.length === 0 && !loading && (
            <tr>
              <td colSpan={5} className="text-center py-5 text-muted">
                Enter a Patient ID and click Search to display results.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}
