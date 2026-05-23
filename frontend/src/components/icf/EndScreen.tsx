import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import './icf.css';

interface Props {
  onEnd: () => void;
}

export default function EndScreen({ onEnd }: Props) {
  return (
    <div className="icf-overlay text-center">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo w-80 md:w-xl max-w-full" />

      <h1 className="font-bold text-4xl md:text-5xl text-[#89D792] mt-12">
        Vielen Dank
        <br />
        für Ihre Teilnahme!
      </h1>
      <p className="mt-6 font-bold text-xl md:text-2xl text-[#FF9A57]">
        Sie haben Alles geschafft!
      </p>

      <FlowerButtonRow style={{ marginTop: 24 }}>
        <button type="button" className="icf-btn icf-btn--primary icf-btn--auto" onClick={onEnd}>
          Beenden
        </button>
      </FlowerButtonRow>
    </div>
  );
}
