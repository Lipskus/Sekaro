# P0 — Inbox oraz lista i szkic kampanii

Baza: `3d5a13dc3323dae792927c0d3c85f4e2a275b061`, branch `fix/p0-safety-sekaro-identity-2026-09-29`. Main przed publikacją: `ca9a544`; jedyny otwarty PR: #37. Użytkownik potwierdził aktualizację poprzedniego pakietu; w tym zadaniu nie sprawdzano wdrożonego SHA na VPS.

## Zakres

- Inbox: etykiety, filtry, panel rozmowy i kontaktu, szkic, szablony, komunikaty blokady, potwierdzenia i wyniki operacji w PL/EN/DE/RU. Daty używają wybranego języka.
- Lista kampanii: filtry, statystyki, statusy, akcje pojedyncze/zbiorcze, priorytety i komunikaty błędów. Usunięcie jawnie oznaczone jako destrukcyjne niezależnie od języka.
- Tworzenie szkicu: formularz, podsumowanie, checklista i wspólne etykiety kroków kreatora. Payload pozostaje wstrzymanym szkicem bez skrzynek, ze stop_on_reply i nagłówkiem rezygnacji, bez śledzenia otwarć/kliknięć.
- SafeEmail: lokalizacja zastępczego tekstu zablokowanego obrazu, ponowna sanitizacja po zmianie języka.
- 187 kluczy w czterech słownikach. Dane użytkownika, nazwy, tematy i treść wiadomości pozostają niezmienione. Błędy pochodzące z API zachowują język źródłowy.

Nie zmieniono schematu bazy ani numeru produktu. To kontynuacja etapu 1/P0. Pełny workspace kampanii, edytor sekwencji, ustawienia i pozostałe moduły wymagają dalszej lokalizacji i odbioru w P0. Przetłumaczone etykiety kroków nie oznaczają ukończenia ich zawartości. ROADMAP.md i kolejność faz PR37 pozostają bez zmian.

## Regresje

163 testy frontendu w 19 plikach: zaliczone. Dziesięć nowych przypadków obejmuje zachowanie szkicu Inbox bez nowych żądań przy zmianie języka, anulowanie wysyłki, suppression i pauzę skrzynki, filtry i zaznaczenia kampanii, jawne potwierdzenie usunięcia, bezpieczny payload szkicu, sanitizację HTML po zmianie języka oraz spójność kluczy/interpolacji słowników.

Produkcyjny build zaliczony; istniejące ostrzeżenie o rozmiarze chunka pozostaje. Testy korzystają z mockowanego API. Nie wysłano prawdziwych wiadomości. Backend nie zmienił się; nie powtarzano jego testów. Nie przeprowadzono upgrade PostgreSQL, backup/restore ani wdrożenia VPS.

## Kontrola UI

Pierwsza macierz: 60 wariantów (5 przepływów × DE/RU × Dark/Light × 1600×900, 768×1024, 390×844). Bez błędów JS; 58 wariantów przeszło pomiary. Dwa warianty rosyjskiego kreatora przy 768 px ujawniły przepełnienie dokumentu do 779 px. Dodano ograniczenie szerokości tekstu i zawijanie długich słów w etykietach kroków.

Końcowa kontrola kreatora po poprawce: 24 warianty (PL/EN/DE/RU, oba motywy, wszystkie trzy rozmiary), bez wykrytych błędów i przepełnienia. Figtree załadowane. Pomiary dialogów obejmują granice ekranu, fokus i blokadę przewijania tła. Manifesty: `evidence-2026-09-30/outreach-localization/ui-matrix-before-wrap-fix.json` oraz `draft-final.json`.

Obejrzano pełnowymiarowe zrzuty: Inbox DE desktop Light i mobile Dark, potwierdzenie odpowiedzi RU mobile Light, potwierdzenie usunięcia kampanii DE desktop Dark, kreator RU tablet Light przed i po poprawce. Wybrane zrzuty zapisano obok manifestów. To lokalne dowody QA, nie nowe makiety ani pełny odbiór pikselowy. Pełna akceptacja P0 pozostaje otwarta.

## Odtworzenie kontroli UI

Po zbudowaniu frontendu:

```bash
P0_PLAYWRIGHT_MODULE=/path/to/playwright \
P0_CHROMIUM=/path/to/chromium \
P0_UI_WORKFLOWS=1 \
P0_UI_FLOWS=inbox-thread,inbox-confirm,campaign-list,campaign-delete,campaign-draft \
P0_UI_LANGUAGES=de,ru \
P0_UI_OUTPUT=/path/to/evidence \
node scripts/check-p0-ui.cjs
```

Lokalne fixtures, zewnętrzne originy blokowane. Potwierdzenia wysyłki/usunięcia są tylko otwierane, nie akceptowane. Odczyt wątku wywołuje zamockowane mark-read. Testowy heartbeat również jest mockowany.

## Aktualizacja istniejącej instalacji

W katalogu repozytorium na branchu P0:

```bash
git pull --ff-only origin fix/p0-safety-sekaro-identity-2026-09-29 &&
docker compose -f docker-compose.sekaro.yml build --pull app &&
bash scripts/sekaro-demo.sh up
```
