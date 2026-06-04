import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

export default function EndScreen() {
  return (
    <div className="icf-overlay text-center">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />

      <h1 className="icf-heading mt-12">
        Vielen Dank
        <br />
        für Ihre Teilnahme!
      </h1>
      <p className="mt-6 font-bold text-xl md:text-2xl text-[#FF9A57]">
        Sie haben alles geschafft!
      </p>
    </div>
  );
}
