import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import './icf.css';

interface Props {
  onEnd: () => void;
}

export default function EndScreen({ onEnd }: Props) {
  return (
    <div className="icf-overlay text-center">
      <img src={logoImage} alt="Logo" className="icf-logo w-80 md:w-xl max-w-full" />
      <h1 className="font-bold text-4xl md:text-5xl text-[#89D792]">
        Vielen Dank
        <br />
        für Ihre Teilnahme!
      </h1>
      <p className="mt-6 font-bold text-xl md:text-2xl text-[#FF9A57]">
        Sie haben Alles geschafft!
      </p>
      <button
        type="button"
        className="icf-btn icf-btn--primary icf-btn--auto"
        style={{ marginTop: 24 }}
        onClick={onEnd}
      >
        Beenden
      </button>
    </div>
  );
}
