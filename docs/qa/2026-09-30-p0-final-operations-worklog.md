# P0 — szablony, harmonogram i powiadomienia

30.09.2026. Kontynuacja tego samego zbiorczego P0 na `work/p0-final-bundle-2026-09-30`, po punkcie `61a106e`. Nie jest to wydanie do instalacji. Zatwierdzona kolejność 11 etapów pozostaje bez zmian.

## Wykonane lokalnie

- P0-03: lokalizacja szablonów PL/EN/DE/RU — lista, edytor, wersje, zmienne, podgląd, test, komunikaty i potwierdzenia. Zmiana języka zachowuje szkic, wersję i dane klienta. Pozostaje blokada wysyłki w DEMO również w obsłudze formularza.
- P0-05: lokalizacja harmonogramu, listy kolejki, kalendarza i pełnego podglądu. Etykiety dni i czasu względnego używają wybranego języka. Zachowane strefy kampanii, kody filtrów, grupowanie oraz dane wiadomości. Zmiana języka nie wywołuje pobrania kolejki ani operacji wysyłki.
- P0-06: lokalizacja powiadomień i preferencji. Zachowane zaznaczenia, filtrowanie, niezapisany adres i wybrane zdarzenia. Zapis nadal przekazuje te same identyfikatory zdarzeń API. Historyczne tytuły i treści powiadomień pozostają danymi.
- P0-08: wykryto niemiecki nagłówek rozszerzający stronę z 390 do 442 px. Dodano zawijanie długich nagłówków we wspólnym PageFrame i ponowiono kontrolę. Po naprawie strona mieści się w 390 px.

## Weryfikacja

- Frontend: pełny zestaw 195 testów, 22 pliki — zaliczony. W tym 11 nowych przypadków: szkice szablonów, zachowanie rzeczywistych wartości podobnych do etykiet UI, blokada DEMO, preferencje i kody zdarzeń, filtry powiadomień, wybrany blok/strefa kalendarza, grupowanie przy północy i zmianie czasu, zachowanie filtrów harmonogramu i wyszukiwania podglądu.
- Build produkcyjny — zaliczony. Nadal występuje istniejące ostrzeżenie Vite o wielkości fragmentu JS; nie jest błędem kompilacji. Vitest nadal emituje ostrzeżenia React Router o przyszłych flagach.
- Kontrola słownika: brak brakujących bezpośrednich kluczy `ct()` w pięciu zmienionych komponentach; zgodne parametry tłumaczeń PL/EN/DE/RU.
- UI: **84/84** kombinacje bez błędów JS, przepełnienia strony ani pozostałych naruszeń mierzonej geometrii. Siedem przepływów × DE/RU × Dark/Light × 1600/768/390 px: edytor szablonu, podgląd szablonu, szczegóły powiadomienia, preferencje, kalendarz, rozwinięta kolejka, podgląd wiadomości.
- Ręcznie obejrzano m.in. niemieckie preferencje i pełny podgląd harmonogramu na 390 px: tekst się zawija, kontrolki i treść mieszczą się w szerokości.
- UI używa wyłącznie fixture i przechwytuje wszystkie żądania API; obce origin są blokowane. Nie używano prawdziwej skrzynki ani transportu pocztowego. Zmian backendu w tym punkcie nie ma; wcześniejszych 41 testów backendowych nie przedstawiamy jako ponownie uruchomionych.

## Dowody i ograniczenia

Manifest: `evidence-2026-09-30/final-operations/ui-matrix.json`. W katalogu zachowano sześć reprezentatywnych zrzutów. Pozostałe zrzuty z manifestu są wynikiem odtwarzalnego skryptu, nie wszystkie są dołączone do repozytorium.

Odtworzenie: zbudować frontend, następnie uruchomić `scripts/check-p0-ui.cjs` z `P0_UI_WORKFLOWS=1`, `P0_UI_FLOWS=template-editor,template-preview,notification-detail,notification-preferences,schedule-calendar,schedule-queue,schedule-preview`, `P0_UI_LANGUAGES=de,ru` oraz lokalnymi ścieżkami Playwright/Chromium w `P0_PLAYWRIGHT_MODULE` i `P0_CHROMIUM`.

To kontrola działającego UI z danymi testowymi. Nie zastępuje porównania 98 plansz, końcowej regresji całego P0 ani dowodu pracy na serwerze użytkownika. P0-04 i P0-07 pozostają otwarte; końcowe bramki P0-08/09/10 nie są zamknięte. Szczegóły w `2026-09-30-p0-final-scope.md`.
