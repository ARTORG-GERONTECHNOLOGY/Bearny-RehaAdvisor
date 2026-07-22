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

import { useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { toISODateUTC, formatLocaleDateTime } from '@/utils/dateFormat';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';
import axios from 'axios';
import apiClient from '../api/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

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
      setAuthError(getApiErrorMessage(e, 'Authentication failed'));
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
      setAuthError(getApiErrorMessage(e, 'Invalid code'));
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
    const dateStr = toISODateUTC(new Date());

    const csvRows = [
      [
        'QuestionID',
        'QuestionText',
        'Rating',
        'Timestamp',
        'AudioFile',
        'DeviceType',
        'Assistance',
      ],
    ];

    for (const item of items) {
      const fileName = item.audioName || `Q${item.questionIndex + 1}_${participantId}.webm`;
      csvRows.push([
        String(item.questionIndex + 1),
        `"${(item.questionText || '').replace(/"/g, '""')}"`,
        item.answerValue === -1 ? 'N/A' : String(item.answerValue),
        item.answeredAt || '',
        item.hasAudio ? fileName : 'No Audio',
        item.deviceType || '',
        item.assistance || '',
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
      <div
        className="container mx-auto py-5"
        style={{ maxWidth: 480, fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
      >
        <h3 className="text-xl font-semibold mb-4">ICF Monitor — Secure Access</h3>
        {step === 'password' ? (
          <>
            <Field className="mb-3">
              <FieldLabel htmlFor="hls-auth-email">Email address (to receive code)</FieldLabel>
              <Input
                id="hls-auth-email"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="researcher@example.com"
              />
            </Field>
            <Field className="mb-3">
              <FieldLabel htmlFor="hls-auth-password">Download password</FieldLabel>
              <Input
                id="hls-auth-password"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
              />
            </Field>
            {authError && <p className="text-nok mb-3">{authError}</p>}
            <Button size="dashboard" onClick={submitPassword} disabled={authLoading}>
              {authLoading ? <Spinner /> : 'Send code'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              A 6-digit code was sent to <strong>{authEmail}</strong>. Check your inbox.
            </p>
            <Field className="mb-3">
              <FieldLabel htmlFor="hls-auth-code">Verification code</FieldLabel>
              <Input
                id="hls-auth-code"
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                maxLength={6}
                style={{ letterSpacing: '0.3em', fontSize: '1.4rem', textAlign: 'center' }}
                autoFocus
              />
            </Field>
            {authError && <p className="text-nok mb-3">{authError}</p>}
            <Button size="dashboard" onClick={submitCode} disabled={authLoading} className="me-2">
              {authLoading ? <Spinner /> : 'Verify'}
            </Button>
            <Button size="dashboard" variant="secondary" onClick={() => setStep('password')}>
              Back
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="container mx-auto py-5"
      style={{ fontFamily: 'Atkinson Hyperlegible, sans-serif' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold mb-0">Admin Dashboard (V2.2)</h3>
        <Button size="dashboard" variant="secondary" onClick={logout}>
          Logout
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-4">
        <div className="md:col-span-4">
          <Field>
            <FieldLabel htmlFor="hls-participant-id" className="font-bold">
              Patient ID (Format: Pxx)
            </FieldLabel>
            <Input
              id="hls-participant-id"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="e.g. P01"
            />
          </Field>
        </div>
        <div className="md:col-span-8">
          <Button size="dashboard" onClick={fetchItems} className="me-2">
            Search
          </Button>
          <Button
            size="dashboard"
            onClick={downloadAll}
            disabled={!items.length || loading}
            className="px-4 shadow-sm"
          >
            {loading ? <Spinner /> : 'Download All (ZIP + CSV)'}
          </Button>
        </div>
      </div>

      <Table className="align-middle">
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Q#</TableHead>
            <TableHead>Question & Timestamp</TableHead>
            <TableHead className="text-center">Rating</TableHead>
            <TableHead className="text-center">Device</TableHead>
            <TableHead className="text-center">Assistance</TableHead>
            <TableHead className="text-center">Audio Size</TableHead>
            <TableHead style={{ width: '320px' }}>Playback</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell className="text-center font-bold">{it.questionIndex + 1}</TableCell>
              <TableCell>
                <div className="font-semibold">{it.questionText}</div>
                <small className="text-sm text-muted-foreground">
                  {it.answeredAt ? formatLocaleDateTime(it.answeredAt) : ''}
                </small>
              </TableCell>
              <TableCell className="text-center">
                {it.answerValue === -1 ? (
                  <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold text-white bg-zinc-500">
                    N/A
                  </span>
                ) : (
                  <span
                    className="inline-block rounded px-1.5 py-0.5 font-semibold text-white bg-primary"
                    style={{ fontSize: '1rem' }}
                  >
                    {it.answerValue}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center text-muted-foreground text-sm">
                {it.deviceType || '—'}
              </TableCell>
              <TableCell className="text-center text-muted-foreground text-sm">
                {it.assistance === 'alone'
                  ? 'Alone'
                  : it.assistance === 'with_help'
                    ? 'With help'
                    : '—'}
              </TableCell>
              <TableCell className="text-center text-muted-foreground text-sm">
                {it.hasAudio ? formatSize(it.audioSize) : '—'}
              </TableCell>
              <TableCell>
                {it.hasAudio ? (
                  audioUrls[it.id] ? (
                    <audio
                      src={audioUrls[it.id]}
                      controls
                      style={{ height: '35px', width: '100%' }}
                    />
                  ) : (
                    <Button size="dashboard" variant="secondary" onClick={() => loadAudio(it.id)}>
                      ▶ Load Recording
                    </Button>
                  )
                ) : (
                  <span className="text-nok text-sm">No recording available</span>
                )}
              </TableCell>
            </TableRow>
          ))}

          {items.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-5 text-muted-foreground">
                Enter a Patient ID and click Search to display results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
