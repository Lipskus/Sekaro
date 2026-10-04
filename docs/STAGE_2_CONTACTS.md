# Etap 2 — kontakty i historia

Zakres zgodny z RELEASE_EXECUTION_PLAN.md. Decyzja implementacyjna 04.10.2026,
przed zmianami kodu: rozszerzamy obecny Lead, bez nowej osoby/firmy/adresów.

## Schemat i zachowanie

- `lead.archived_at`: nullable UTC timestamp, NULL oznacza kontakt poza archiwum.
- `campaign_lead.archive_sending_paused`: trwała pauza po archiwizacji.
  Nie jest kasowana przez wznowienie skrzynki; jej wyłączenie wymaga jawnego
  wznowienia konkretnego enrollmentu (lub istniejącej operacji recovery).
- `contact_operation`: ID, lead_id (FK), action, occurred_at UTC, actor_id
  (nullable FK użytkownika), actor_name (trwała migawka nazwy), details JSON.
  Autor pochodzi wyłącznie z uwierzytelnionej sesji. Historia operacji nie
  kopiuje EmailLog ani LeadReply. Początkowe zdarzenia: archive, restore, update.
- Migracja addytywna PostgreSQL, idempotentna. Istniejące rekordy pozostają
  niearchiwalne; ich ID, enrollmenty, korespondencja i suppression nie zmieniają się.
- Archiwizacja zachowuje wszystkie powiązania, pauzuje istniejące enrollmenty,
  usuwa przyszłe sloty bez rozpoczętej próby wysyłki. Trwałych SendAttempt nie
  kasujemy. Archiwum jest wykluczone w schedulerze i ostatniej kontroli nadawcy.
- Przywrócenie zmienia wyłącznie archived_at. Nie odpauzowuje kampanii kontaktu,
  nie usuwa suppression, nie resetuje statusów/weryfikacji, nie przelicza kolejki.
- Lista/eksport: zakres current (domyślny), archived, all. Profil zachowuje
  oddzielne informacje o archiwum, suppression, weryfikacji i statusie kampanii.
- Operacje seryjne są atomowe, blokują rekordy w kolejności ID; powtórzona
  archiwizacja/przywrócenie nie tworzy zdarzenia bez zmiany stanu.

Wysłanej już wiadomości nie można cofnąć archiwizacją. Ostatnia kontrola
nadawcy blokuje rekord kontaktu do końca transakcji, aby uporządkować ją
względem równoległej archiwizacji.
