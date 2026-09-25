import Logo from '../redesign/Logo';

export default function SplashScreen() {
  return (
    <div className="sk-splash-screen" role="status" aria-live="polite" aria-label="Uruchamianie Sekaro">
      <div className="sk-splash-card">
        <span className="sk-splash-logo"><Logo /></span>
        <div>
          <strong>Sekaro</strong>
          <small>Uruchamianie aplikacji…</small>
        </div>
        <span className="sk-splash-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
