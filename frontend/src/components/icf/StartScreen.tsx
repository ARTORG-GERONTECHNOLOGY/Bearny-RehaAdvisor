import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import './icf.css';

interface Props {
  micError: string;
  onStart: () => void;
}

export default function StartScreen({ micError, onStart }: Props) {
  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo w-80 md:w-xl max-w-full" />
      <h1 className="font-bold text-4xl md:text-5xl text-[#89D792]">Willkommen</h1>

      <div className="mt-6 max-w-2xl">
        <p style={{ marginBottom: 14 }}>
          Gleich beginnt das Assessment mit dem{' '}
          <strong>
            <i>FunktionsBarometer</i>
          </strong>
          , dem interaktiven Instrument zur Erhebung Ihrer Funktionsfähigkeit.
        </p>

        <p style={{ marginBottom: 14 }}>
          Dafür werden wir Ihnen Themen und Bereiche nennen, welche Sie mit der Frage{' '}
          <strong style={{ color: '#f77218' }}>
            <i>
              {
                '"Von sehr schlecht bis sehr gut, wie geht es in folgendem Bereich jetzt und in den letzten Tagen … "'
              }
            </i>
          </strong>{' '}
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

        <div style={{ marginBottom: 14 }}>
          Bevor wir starten,
          <ul>
            <li>begeben Sie sich bitte an einen ruhigen und ungestörten Ort,</li>
            <li>erlauben Sie Zugriff auf das Mikrofon,</li>
            <li>sprechen Sie klar und deutlich,</li>
            <li>und antworten Sie auf alles so, wie es für Sie stimmt.</li>
          </ul>
        </div>

        <p style={{ marginBottom: 14 }}>
          Ihre Daten werden{' '}
          <strong>
            <i>verschlüsselt übermittelt</i>
          </strong>
          , nennen Sie dennoch bitte keine Namen oder andere identifizierende Merkmale.
        </p>

        <p style={{ marginBottom: 14 }}>
          Wir möchten Sie gerne daran erinnern, dass sich dieses Instrument in der Entwicklung
          befindet und als interaktiver Fragebogen verstanden wird. Bei Bedarf an medizinischer
          Unterstützung, wenden Sie sich bitte an Ihre/n behandelnde/n Ärztin/Arzt.
        </p>

        <p style={{ marginBottom: 14 }}>
          Die Informationen von dieser Seite können jederzeit über den{' '}
          <strong>
            <i>hellgrünen Infobutton</i>
          </strong>{' '}
          aufgerufen werden.
        </p>

        <p style={{ marginBottom: 24 }}>
          Wenn Sie alles verstanden haben und bereit sind, drücken Sie auf{' '}
          <i>{'"Übungslauf starten"'}</i>, um mit einem Übungsbeispiel zu beginnen, danach startet
          das FunktionsBarometer.
        </p>

        {!!micError && <p style={{ color: '#b00020' }}>{micError}</p>}

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
