import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

interface Props {
  value: string;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function PatientIdScreen({ value, error, onChange, onSubmit }: Props) {
  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo w-80 md:w-xl max-w-full" />
      <h1 className="font-bold text-4xl md:text-5xl text-[#89D792]">Patienten-ID</h1>

      <div className="mt-6 max-w-2xl w-full">
        <p className="text-center" style={{ marginBottom: 14 }}>
          Bitte geben Sie die Patienten-ID ein (Format: P001-001T1).
        </p>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          placeholder="P001-001T1"
          autoFocus
          style={{
            width: '100%',
            fontSize: 20,
            padding: '12px 14px',
            borderRadius: 12,
            border: `2px solid ${error ? '#b00020' : '#ccc'}`,
            marginBottom: 10,
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
          className="max-w-sm mx-auto block"
        />

        {error && <p className="text-center text-red-600 mb-2">{error}</p>}

        <FlowerButtonRow style={{ marginTop: 32 }}>
          <button
            type="button"
            className="icf-btn icf-btn--primary icf-btn--auto"
            onClick={onSubmit}
          >
            Weiter
          </button>
        </FlowerButtonRow>
      </div>
    </main>
  );
}
