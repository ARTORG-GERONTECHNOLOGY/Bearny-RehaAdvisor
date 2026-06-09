import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

interface Props {
  micError: string;
  onStart: () => void;
}

export default function StartScreen({ micError, onStart }: Props) {
  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />
      <h1 className="icf-heading">Willkommen</h1>

      <div className="mt-6 max-w-2xl">
        <p className="mb-3.5">
          Gleich beginnt das Assessment mit dem{' '}
          <strong>
            <i>FunktionsBarometer</i>
          </strong>
          , ein interaktives Instrument zur Erhebung Ihrer Funktionsfähigkeit.
        </p>

        <p className="mb-3.5">
          Dafür werden wir Ihnen Themen und Bereiche nennen, welche Sie mit der Frage{' '}
          <strong>
            <i>
              “Von sehr schlecht bis sehr gut, wie geht es in dem folgenden Bereich, jetzt und in
              den letzten Tagen … “
            </i>
          </strong>{' '}
          bewerten dürfen.
        </p>

        <p className="mb-3.5">
          Zuerst dürfen Sie den Bereich auf der Skala bewerten. Danach erklären Sie uns Ihre
          Bewertung, indem Sie frei dazu erzählen.
        </p>

        <div className="mb-3.5">
          Bevor wir starten,
          <ul>
            <li>begeben Sie sich bitte an einen ruhigen und ungestörten Ort mit Internet,</li>
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
          , nennen Sie dennoch, wenn möglich bitte keine Namen oder andere identifizierenden
          Merkmale.
        </p>

        <p className="mb-3.5">
          Wir möchten Sie gerne daran erinnern, dass dieses Instrument als interaktiver Fragebogen
          verstanden wird. Wenn Sie ergänzend medizinische Unterstützung wünschen, wenden Sie sich
          bitte an Ihre/n behandelnde/n Ärztin/Arzt.
        </p>

        <p className="mb-3.5">
          Die Informationen von dieser Seite können jeder Zeit über den{' '}
          <strong>
            <i>hellgrünen Infobutton</i>
          </strong>{' '}
          aufgerufen werden.
        </p>

        <p className="mb-6">
          Wenn Sie alles verstanden haben und bereit sind, drücken Sie auf{' '}
          <i>{'"Übungslauf starten"'}</i>, um mit einem Übungsbeispiel zu beginnen, danach startet
          das FunktionsBarometer.
        </p>

        {!!micError && <p className="icf-audio-error">{micError}</p>}

        <FlowerButtonRow>
          <button
            type="button"
            className="icf-btn icf-btn--primary icf-btn--auto"
            onClick={onStart}
          >
            Übungslauf starten
          </button>
        </FlowerButtonRow>
      </div>
    </main>
  );
}
