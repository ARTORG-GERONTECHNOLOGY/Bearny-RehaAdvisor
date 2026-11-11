import { useRef } from 'react';
import logoImage from '@/assets/icf/logo_funktionsbarometer.png';
import { FlowerButtonRow, FlowerSides } from './FlowerDecoration';
import '@/assets/styles/icf.css';

export const EXPLAINER_VIDEO_SRC = '/icf-video/funktionsbarometer-erklaervideo.mp4';

interface Props {
  onContinue: () => void;
  micError?: string;
}

export default function VideoScreen({ onContinue, micError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleContinue = () => {
    // Narration would otherwise play over the mic prompt and into the first recording.
    videoRef.current?.pause();
    onContinue();
  };

  return (
    <main className="icf-page">
      <FlowerSides />

      <img src={logoImage} alt="Logo" className="icf-logo" />

      <div className="mt-6 max-w-2xl w-full">
        <video
          ref={videoRef}
          src={EXPLAINER_VIDEO_SRC}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-lg"
          data-testid="icf-explainer-video"
        />

        {!!micError && <p className="icf-audio-error">{micError}</p>}

        <FlowerButtonRow style={{ marginTop: 32 }}>
          <button
            type="button"
            className="icf-btn icf-btn--primary icf-btn--auto"
            onClick={handleContinue}
          >
            Weiter
          </button>
        </FlowerButtonRow>
      </div>
    </main>
  );
}
