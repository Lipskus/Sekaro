# P0 — wspólne okna, formularze i responsywność

## Zakres

Kontynuacja brancha `fix/p0-safety-sekaro-identity-2026-09-29`, baza `d201155`. Zatwierdzony plan wykonania 11 większych wydań zapisano w `docs/RELEASE_EXECUTION_PLAN.md`. ROADMAP.md i PR37 pozostają niezmienione.

Zmiany są jednym pakietem P0. Nie dodają CRM, nowych integracji ani drugiej instalacji. Nie zmieniają schematu bazy, licencji, nazewnictwa historycznego ani numeracji wersji.

## Wykryte i poprawione problemy

1. Wspólny Modal nie blokował przewijania tła. Teraz blokada pozostaje aktywna aż do zamknięcia ostatniego zagnieżdżonego okna, a poprzedni stan jest przywracany.
2. Fokus nie był poprawnie obsługiwany przy zagnieżdżonych dialogach i wyłączonych kontrolkach. Escape obsługuje tylko najwyższe okno; Tab omija ukryte/wyłączone kontrolki; przy braku dostępnych kontrolek fokus pozostaje na dialogu. Powrót następuje do elementu, który otworzył okno.
3. Po wczytaniu podglądu importu wyłączenie przycisku na czas operacji przenosiło fokus na tło. Obsługa zmian `busy` odzyskuje fokus wewnątrz okna.
4. Ciąg bez spacji w podglądzie sekwencji wychodził poza czytelny obszar. Temat i treść zawijają długie ciągi; obrazy HTML nie przekraczają szerokości podglądu.
5. Na ekranie 390 px pola mapowania importu były zbyt wąskie i ucinały nazwy opcji. Mają teraz minimalną czytelną szerokość. Tabela przewija się wewnątrz okna, z nazwanym obszarem dostępnym z klawiatury.

## Odtwarzalna kontrola przeglądarkowa

Rozbudowany `scripts/check-p0-ui.cjs` obsługuje `P0_UI_WORKFLOWS=1` oraz opcjonalne `P0_UI_FLOWS`. Wszystkie żądania API są przechwycone; zewnętrzne originy blokowane. Użyto zbudowanego frontendu, lokalnego Chromium i izolowanych fixture. Nie są to zrzuty nowego wdrożenia VPS ani nowe makiety produktu.

Przepływy: dodanie kontaktu, podgląd i mapowanie CSV, zarządzanie własnymi polami, podgląd sekwencji z długą treścią, wybór retencji skrzynki, menu mobilne. Na desktopie przypadek menu sprawdza zwykłą nawigację; otwarcie szuflady dotyczy 390 px.

Wymiary: 1600×900, 768×1024, 390×844. Motywy: Dark i Light. Pomiary: szerokość dokumentu, błędy JavaScript, dostępność Figtree, granice dialogów, fokus w dialogach, blokada przewijania i przepełnienie treści podglądu. Zaznaczenie retencji nie wykonuje zapisu; import kończy się na podglądzie, nie tworzy kontaktów.

Pole `mutations` w wynikach oznacza przechwycone żądania do fixture (heartbeat, podgląd importu lub wiadomości), a nie rzeczywiste zmiany backendu.

## Wyniki

- 129 testów backendu: SMTP, archiwum, lokalny fake SMTP E2E, import, szablony, scheduler, redesign, demo i ochrona wysyłki. Bez prawdziwych wiadomości zewnętrznych.
- 135 testów frontendu / 16 plików: zaliczone. Dodano regresje zagnieżdżonych dialogów, klawiatury, blokady przewijania, obsługi busy i odzyskiwania fokusu.
- Build produkcyjny: zaliczony; pozostaje wcześniejsze ostrzeżenie o wielkości chunka.
- Macierz 36 przypadków po poprawkach fokusu i długich treści: bez błędów. Wyniki w `evidence-2026-09-29/forms/workflows.json`.
- Końcowe sprawdzenie sześciu wariantów podglądu importu po poszerzeniu pól: bez błędów; wynik w `evidence-2026-09-29/forms/import-recheck.json`.
- W repozytorium zapisano wybrane zrzuty; manifesty opisują całą macierz. Oględziny wybranych PNG w pełnym rozmiarze, nie pełna akceptacja pikselowa wszystkich stanów.
- `git diff --check`: zaliczony przed publikacją.

## Pozostały odbiór etapu 1

Nie deklarujemy pełnego 1:1 dla 98 historycznych plansz ani pełnej lokalizacji treści wszystkich modułów. Otwarte pozostają porównanie referencji i uzgodnienie odstępstw, pozostałe stany/długie dane oraz odbiór nowego pakietu na VPS. Testy PostgreSQL upgrade i backup/restore, a także docelowa izolacja publicznej rezygnacji należą do otwartych bramek stabilności z planu. Zatwierdzenie podziału na wydania nie zamyka tych bramek.
