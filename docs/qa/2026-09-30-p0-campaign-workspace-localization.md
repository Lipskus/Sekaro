# P0 — obsługa kampanii i edycja sekwencji

Baza: `23bf91668c43f68282ed47aee64df1e1161e817f`, branch `fix/p0-safety-sekaro-identity-2026-09-29`. Przed pracą sprawdzono remote: main `ca9a544`, jedyny otwarty PR #37. Nie zmieniono ROADMAP.md ani kolejności faz.

## Zakres

PL/EN/DE/RU obejmuje przegląd kampanii, harmonogram, wybór skrzynek, ustawienia, pre-flight, aktywność i obsługę niepewnych wysyłek. Sekwencje obejmują oś kroków, edytor standardowy i spersonalizowany, warianty A/B, podgląd, wiadomość indywidualną, treść zastępczą, ostrzeżenia i potwierdzenia.

Wykorzystano istniejący LanguageContext, widoki, formularze, Modal i ConfirmContext. Osobny katalog tekstów kampanii stosuje tekst źródłowy jako klucz; nie tłumaczy DOM ani danych użytkownika. Identyfikatory kroków, typów sekwencji, wariantów, statusów i dni tygodnia nie zmieniają się. Zmieniono tylko etykiety dni, zachowując numerację poniedziałek=0. Daty przeglądu/aktywności i wspólny wykres ActivityChart stosują wybrany język, zachowując dotychczasowe strefy czasowe.

Zmiana języka nie dodaje zależności od tłumaczeń do pobierania kampanii i podglądu. Szkice ustawień, harmonogramu i sekwencji pozostają w stanie komponentów. Nazwy kampanii, treści, tematy i wartości zmiennych nie są tłumaczone. Funkcja skrótu wiadomości tłumaczy wyłącznie tekst zastępczy dla pustej treści, nigdy zapisany tekst klienta.

Usunięcie kampanii, kroku i wariantu przekazuje jawne `danger:true` do istniejącego potwierdzenia. Ostrzeżenia o trybie wysyłania po przygotowaniu i możliwym duplikacie po odblokowaniu zachowano. Błędy pre-flight blokują wywołanie startu. DEMO nadal blokuje testową wysyłkę.

Oględziny wykazały dwa problemy układu: stała wysokość przycisku zastosowania treści zastępczej przycinała rosyjski tekst, a dwie kolumny ustawień przy szerokości tabletu nadmiernie dzieliły adres skrzynki. Przycisk może się zawijać i zwiększać wysokość; ustawienia do 1000 px używają jednej kolumny. Desktop 1600 px zachowuje dotychczasowy układ.

## Testy

- Pełny frontend: 175 testów w 20 plikach, zaliczone. Dwanaście nowych przypadków obejmuje szkice i kody API, wstrzymanie startu przez pre-flight, anulowanie usunięcia, niezapisaną sekwencję, podgląd bez ponownego pobierania przy zmianie języka, blokadę DEMO, filtry aktywności i ostrzeżenie odblokowania, nieznany kod błędu oraz zachowanie treści użytkownika.
- Po uzupełnieniu komunikatów zapisu powtórzono 12 nowych regresji, w tym sprawdzenie przetłumaczonego wyniku zapisu ustawień: zaliczone.
- Produkcyjny build: zaliczony. Dotychczasowe ostrzeżenie Vite o dużym chunku pozostaje.
- Sprawdzono zgodność kluczy/interpolacji czterech słowników i brak brakujących statycznych odwołań `ct()` w zmienionych widokach.
- Pierwsza macierz: 120 wariantów, bez błędów JS i przepełnienia dokumentu. Ręczne oględziny wykryły przycięcie przycisku mimo poprawnego pomiaru całej strony.
- Macierz po poprawce przycisku i uzupełnieniu nawigacji: 120 wariantów. Dziesięć przepływów × DE/RU × Dark/Light × 1600×900, 768×1024, 390×844. Bez błędów JS, przepełnienia dokumentu/kart sidebara i przycisku treści zastępczej. Dialogi mieszczą się na ekranie, mają fokus wewnątrz i blokują przewijanie tła. Figtree załadowane.

Końcowa kontrola ustawień po zmianie układu tabletu: 24 warianty (PL/EN/DE/RU × Dark/Light × trzy rozmiary), bez wykrytych błędów i przepełnienia. Wyniki w `settings-final.json`. Obejrzano też końcowe ustawienia DE tablet Dark i widok spersonalizowany RU mobile Light.

Obejrzano zrzuty przeglądu DE desktop Dark, edytora DE desktop Light, wiadomości spersonalizowanych RU desktop Dark przed i po poprawce, ustawień DE tablet Dark, aktywności DE mobile Light i podglądu RU mobile Dark. Wybrane obrazy i manifest pomiarów znajdują się w `evidence-2026-09-30/campaign-workspace-localization/`. Wysokie formularze i podgląd korzystają z przewijania; zrzut pierwszego ekranu nie jest odbiorem całej przewijanej zawartości.

Wszystkie API w testach i macierzy były mockowane; lokalne QA blokowało zewnętrzne originy. Nie wysłano prawdziwych wiadomości, zaproszeń ani żądań zapisujących dane VPS. Backend i schema nie zmieniły się, nie powtarzano jego testów. Nie wykonano PostgreSQL upgrade, backup/restore ani potwierdzenia SHA uruchomionego na VPS.

## Odtworzenie UI

Po zbudowaniu frontendu:

```bash
P0_PLAYWRIGHT_MODULE=/path/to/playwright \
P0_CHROMIUM=/path/to/chromium \
P0_UI_WORKFLOWS=1 \
P0_UI_FLOWS=campaign-overview,campaign-schedule,campaign-inboxes,campaign-settings,campaign-preflight,campaign-activity,sequence-edit,sequence-variant,sequence-personalized,sequence-preview \
P0_UI_LANGUAGES=de,ru \
P0_UI_OUTPUT=/path/to/evidence \
node scripts/check-p0-ui.cjs
```

## Pozostały P0

Ten pakiet nie oznacza pełnej lokalizacji całego CampaignDetail: zakładki odbiorców i analityki oraz nieużywany przez nowy workspace starszy formularz ustawień pozostają do uporządkowania. Pozostają również inne moduły, komunikaty źródłowe API i dalszy odbiór referencyjny. Nie zamknięto P0, nie rozpoczęto etapu 2, nie nadano nowego numeru produktu i nie zatwierdzono pełnego 1:1.

Aktualizacja istniejącej instalacji z katalogu repozytorium na branchu P0:

```bash
git pull --ff-only origin fix/p0-safety-sekaro-identity-2026-09-29 &&
docker compose -f docker-compose.sekaro.yml build --pull app &&
bash scripts/sekaro-demo.sh up
```
