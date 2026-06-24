import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

interface Props {
  onSelect: (mode: 'alone' | 'with_help') => void;
  micError?: string;
}

export default function AssistanceScreen({ onSelect, micError }: Props) {
  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />

      <div className="mt-6 max-w-2xl">
        <p className="mb-6 text-xl font-semibold">
          Machen Sie Ihre Übungen heute alleine oder mit Unterstützung?
        </p>

        <p className="mb-8">Ihre Antwort hilft uns, Ihren Fortschritt besser zu verstehen.</p>

        {!!micError && <p className="icf-audio-error">{micError}</p>}

        <FlowerButtonRow>
          <button
            type="button"
            className="icf-btn icf-btn--neutral icf-btn--auto"
            onClick={() => onSelect('alone')}
          >
            Alleine
          </button>
          <button
            type="button"
            className="icf-btn icf-btn--primary icf-btn--auto"
            onClick={() => onSelect('with_help')}
          >
            Mit Unterstützung
          </button>
        </FlowerButtonRow>
      </div>
    </main>
  );
}
