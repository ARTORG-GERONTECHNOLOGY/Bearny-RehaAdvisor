import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

export type DeviceChoice = 'smartphone' | 'tablet' | 'laptop' | 'desktop';

interface Props {
  onSelect: (device: DeviceChoice) => void;
  micError?: string;
}

export default function DeviceScreen({ onSelect, micError }: Props) {
  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />

      <div className="mt-6 max-w-2xl w-full">
        <p className="mb-8 text-xl font-semibold">Welches Gerät nutzen Sie jetzt dafür?</p>

        {!!micError && <p className="icf-audio-error">{micError}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            className="icf-btn icf-btn--neutral"
            onClick={() => onSelect('smartphone')}
          >
            Smartphone, Handy
          </button>
          <button
            type="button"
            className="icf-btn icf-btn--neutral"
            onClick={() => onSelect('tablet')}
          >
            Tablet, iPad
          </button>
          <button
            type="button"
            className="icf-btn icf-btn--neutral"
            onClick={() => onSelect('laptop')}
          >
            Laptop, Notebook
          </button>
          <button
            type="button"
            className="icf-btn icf-btn--neutral"
            onClick={() => onSelect('desktop')}
          >
            Computer
          </button>
        </div>
      </div>
    </main>
  );
}
