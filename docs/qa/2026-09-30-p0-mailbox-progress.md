# P0-04 — postęp skrzynek i retencji

30.09.2026, lokalny branch `work/p0-final-bundle-2026-09-30`, praca po `9ee89d3`. Etap 1 zatwierdzonego planu nadal trwa; jeden zbiorczy pakiet P0, bez wydania ani aktualizacji serwera.

## Zakres wykonany

Archiwum i retencja są zlokalizowane w PL/EN/DE/RU: reguły, potwierdzenie usuwania, statusy oryginałów, daty i wielkości, odświeżanie, stronicowanie, pobieranie EML. Tematy wiadomości, adresy i diagnostyka pochodząca z serwera pozostają danymi.

Obsługa zapisu sprawdza tę samą regułę co przycisk: tryb z dozwolonej listy, zapisane dane, brak trwającej operacji, rzeczywista zmiana, liczba dni 1–3650 oraz — dla usuwania — skonfigurowany IMAP i jawne potwierdzenie. Zachowane kody API `keep`, `immediate`, `days`; zmiana języka nie zapisuje ustawień i nie pobiera ich ponownie.

Zlokalizowano listę skrzynek, podstawowe metryki i filtry, dane nadawcy, pola SMTP/IMAP, limity, większość pól rozgrzewania, formularz dodawania i potwierdzenie odrzucenia zmian. Testy potwierdzają zachowanie szkicu SMTP i nazwy nadawcy przy zmianie języka; test połączenia nadal wymaga zapisania zmian połączenia.

## Co nadal jest otwarte

**P0-04 nie jest zamknięte.** Pozostają opcje i instrukcje trackingu Beacon/DNS, część dynamicznych komunikatów dodawania/usuwania/wstrzymywania oraz opisów rozgrzewania i diagnostyki. Aktualny UI tych części może zawierać język polski. Nie jest to deklaracja pełnej lokalizacji skrzynek ani zgodności z 98 planszami.

## Weryfikacja

- Pełny frontend: 210 testów w 22 plikach zaliczone. Po końcowym uzupełnieniu nazw zakładek ponownie zaliczone 26 testów skrzynek/archiwum.
- Dodano 15 przypadków: 9 kombinacji języka i trybu retencji, 3 nieprawidłowe zakresy dni, 3 języki dla zachowania szkiców SMTP i nadawcy.
- Backend `tests/test_mail_archive.py`: 19 zaliczonych, w tym trwałość archiwum i bezpieczne usuwanie właściwego oryginału. Transport testowy; bez rzeczywistych wiadomości lub operacji na zewnętrznej skrzynce.
- Build frontendowy zaliczony; istniejące ostrzeżenie o rozmiarze fragmentu JS pozostaje. Backend emituje dotychczasowe ostrzeżenia deprecacyjne.
- Macierz UI obejmuje dodawanie skrzynki, dane nadawcy, połączenie SMTP/IMAP i retencję: DE/RU × Dark/Light × 1600/768/390 px. **48/48 kontroli zaliczonych**: bez błędów JS i naruszeń mierzonej geometrii. Wynik i trzy wybrane zrzuty: `evidence-2026-09-30/mailbox-progress/`.

Testy UI przechwytują wszystkie żądania API, blokują obce origin i korzystają z fixture. Nie są dowodem wdrożenia na serwerze użytkownika. P0-07 oraz końcowe bramki P0-08/09/10 pozostają otwarte.

Manifest obejmuje wszystkie 48 kombinacji; repozytorium zawiera trzy reprezentatywne zrzuty. Pozostałe można odtworzyć przez `scripts/check-p0-ui.cjs`, ustawiając `P0_UI_WORKFLOWS=1`, `P0_UI_FLOWS=mailbox-add,mailbox-sender,mailbox-smtp,mailbox-retention`, `P0_UI_LANGUAGES=de,ru` i lokalne ścieżki Playwright/Chromium. Kontrola geometrii nie oznacza, że pozostałe polskie treści zostały zaakceptowane.
