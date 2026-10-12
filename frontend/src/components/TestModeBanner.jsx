import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function TestModeBanner() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    api.get('/settings/test-mode').then(data => {
      setEnabled(data.enabled);
    }).catch(() => {});
  }, []);

  if (!enabled) return null;
  return (
    <div className="sk-test-mode-banner" role="status">
      <span>Tryb testowy jest włączony. Wiadomości nie będą wysyłane do rzeczywistych odbiorców.</span>
      <Link to="/settings#dev">Otwórz Ustawienia → Tryb testowy</Link>
    </div>
  );
}
