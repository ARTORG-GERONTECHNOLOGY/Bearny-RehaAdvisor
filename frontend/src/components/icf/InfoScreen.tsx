import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

interface Props {
  isRecording: boolean;
  onClose: () => void;
}

export default function InfoScreen({ isRecording, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-dialog-title"
      className="icf-overlay"
    >
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />
      <h1 id="info-dialog-title" className="icf-heading">
        Information
      </h1>

      <div className="mt-6 max-w-2xl">
        <p className="mb-3.5">
          Der{' '}
          <strong>
            <i>FunktionsBarometer</i>
          </strong>{' '}
          ist ein interaktives Instrument zur Erhebung Ihrer Funktionsfähigkeit.
        </p>

        <p className="mb-3.5">
          Dafür werden wir Ihnen Themen und Bereiche nennen, welche Sie auf einer Skala{' '}
          <strong>
            <i>bewerten</i>
          </strong>{' '}
          dürfen.
          <br />
          Erklären Sie uns Ihre Bewertung, indem Sie einfach{' '}
          <strong>
            <i>frei erzählen</i>
          </strong>
          .
        </p>

        <div className="mb-3.5">
          Wichtig:
          <ul>
            <li>begeben Sie sich bitte an einen ruhigen und ungestörten Ort,</li>
            <li>erlauben Sie Zugriff auf das Mikrofon,</li>
            <li>sprechen Sie klar und deutlich,</li>
            <li>und antworten Sie auf alles so, wie es für Sie stimmt.</li>
          </ul>
        </div>

        <p className="mb-3.5">
          Ihre Daten werden{' '}
          <strong>
            <i>verschlüsselt übermittelt</i>
          </strong>
          , nennen Sie dennoch bitte keine Namen oder andere identifizierende Merkmale.
        </p>

        <p className="mb-3.5">
          Dieses Instrument wird als interaktiver Fragebogen verstanden. Bei Bedarf an
          medizinischer Unterstützung wenden Sie sich bitte an Ihre/n behandelnde/n Ärztin/Arzt.
        </p>

        <p className="mb-3.5">
          Die Informationen von dieser Seite können jederzeit über den{' '}
          <strong>
            <i>hellgrünen Infobutton</i>
          </strong>{' '}
          aufgerufen werden.
        </p>

        <p className="mb-6">
          Wenn Sie alles verstanden haben und bereit sind, drücken Sie auf <i>{'"zurück"'}</i>, um
          mit dem FunktionsBarometer fortzufahren.
        </p>

        {isRecording && (
          <div className="flex items-center gap-1 mb-4">
            <div
              aria-label="Aufnahme läuft"
              title="Aufnahme läuft"
              className="icf-rec-dot animate-pulse"
            />
            <span className="icf-rec-text">Aufnahme läuft</span>
          </div>
        )}

        <FlowerButtonRow>
          <button
            type="button"
            className="icf-btn icf-btn--primary icf-btn--auto"
            onClick={onClose}
          >
            zurück
          </button>
        </FlowerButtonRow>
      </div>
    </div>
  );
}
