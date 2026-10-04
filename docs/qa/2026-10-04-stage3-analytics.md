# Etap 3 — sprawdzenie pakietu, 04.10.2026

Status: implementacja i testy lokalne; **oczekuje na wdrożenie i odbiór demo**. Baza: `2b9b506`, odebrany etap 2. Gałąź: `work/stage-3-outreach-analytics-2026-10-04`. Zakres i definicje: `docs/STAGE_3_ANALYTICS.md`.

## Sprawdzone

- Pełny backend: **522 passed, 9 skipped**. Pominięcia wynikają z dostępności opcjonalnych zależności/integracji; nie traktujemy ich jako zaliczonych testów transportu.
- Nowe przypadki etapu 3, ponownie po końcowym przeglądzie: **14 passed**. Obejmują: odwrócony/niepoprawny/nadmierny zakres, NULL klasyfikacji, brak i duplikaty przypisania, duplikaty odpowiedzi, odpowiedzi przed i po okresie, kohortę i mianownik, ostatnią skrzynkę/krok, brak stanu, pole kraju, filtr kampanii, DNS/Null MX/brak selektora, błędne kody listy blokad, blokadę sieci demo, brak sekretów w diagnostyce oraz unieważnianie testu po zmianie połączenia.
- Frontend: **240 passed**, w tym 5 nowych przypadków raportu, CSV i domen. Filtry wspólne z okresem/kampanią, wykluczenie pól systemowych, odrzucenie nieaktualnej odpowiedzi, blokada eksportu po błędzie, formuły w CSV, brak pomiaru/demo oraz czyszczenie zmienionego pomiaru.
- `npm run build`: PASS. Pozostaje wcześniejsze ostrzeżenie o wielkości bundla, poza zakresem etapu.
- PostgreSQL: wykonano 6 faktycznie wygenerowanych zapytań SQL raportu dziennego i kohortowego w **PostgreSQL 18.3 przez PGlite 0.5.8 (WASM)**. Dwie wysyłki i dwa identyczne znaczniki odpowiedzi dają jednego odpowiadającego, poprawny stan odbicia i pole kraju. To kontrola zgodności SQL, nie test obciążenia ani połączenia z VPS. Wynik: `2026-10-04-stage3-postgres.json`.
- `git diff --check`: PASS. Brak migracji i zmiany schematu danych.

## Odbiór po wdrożeniu

Sprawdzić w tej samej zalogowanej sesji demo: Analityka (kampania, skrzynka, kraj/region jako istniejące pole), zmiana okresu, CSV oraz Domeny. Demo musi nadal blokować sieć i oznaczać stan skrzynek jako fikcyjny. Żadna wysyłka ani synchronizacja nie jest potrzebna do odbioru.

Zewnętrzne DNS i lista blokad były testowane kontrolowanymi odpowiedziami. Nie wykonano pomiarów DNS na serwerze klienta ani połączeń SMTP/IMAP. Własności protokołów, reputacja i dostarczalność nie są potwierdzone przez obecność rekordów.

Etap 4 pozostaje nierozpoczęty. Nie scalono do main i nie wdrożono aplikacji z konta agenta.
