# Pakiet porządkowy CRM — 05.10.2026

## Zakres jednego wydania

- Jedna pozycja CRM w menu bocznym. Wewnątrz: Kontakty, Grupy kontaktów, Firmy, Szanse, Zadania i spotkania, Kalendarz.
- Dotychczasowe adresy kontaktów, firm i sprzedaży zachowane. Widok sprzedaży zapisany w URL; przejścia między zakładkami sprzedaży zachowują filtry powiązania z osobą/firmą/szansą.
- Grupa z zaznaczonych kontaktów albo pusta grupa z późniejszym wyszukaniem i dodaniem istniejących kontaktów. Ponowne dodanie członka nie powiela go. Usunięcie członkostwa zachowuje Lead i jego kampanie.
- W odbiorcach kampanii przycisk „Z grupy kontaktów”. Domyślne pomijanie kontaktów już należących do kampanii, jawna informacja o skutkach dodania do aktywnej kampanii, wynik z licznikami dodanych/duplikatów/blokad/błędów.
- Ponowne wykorzystanie ContactList, ContactListMember i istniejącej ścieżki enrollment. Bez nowej tabeli osób, bez migracji danych. Importowane wcześniej listy dostępne jako grupy.
- Nowy interfejs PL/EN/DE/RU; wspólne Shell, Panel, Modal, Button i tokeny jasnego/ciemnego motywu.
- Etap 7 pozostaje wstrzymany. Brak automatyzacji i nowych raportów.

## Testy i ograniczenia odbioru

Testy API obejmują utworzenie grupy z istniejących ID, walidację atomową, powtarzalne dodawanie członków, usunięcie członkostwa bez usunięcia kontaktu, uprawnienia, enrollment i zachowanie suppression/archiwizacji. Test regresji potwierdza obsługę osoby zapisanej do więcej niż jednej kampanii (dotychczas scalar_one_or_none powodowało błąd).

Testy UI obejmują tworzenie z zaznaczenia, ochronę przed podwójnym zapisem, wyszukiwanie członków, usuwanie członkostwa, błędy i wyniki enrollment oraz zachowanie kontekstu w zakładkach CRM.

Pełny zestaw backendu: **559 zaliczonych, 9 pominiętych**.

Weryfikacja lokalna używa SQLite; nie jest testem współbieżnych blokad PostgreSQL 17. Build produkcyjny zakończony poprawnie, pozostaje wcześniejsze ostrzeżenie o dużym bundlu.

Pełny zestaw UI: 252/253 zaliczone w pierwszym przebiegu; jeden timeout istniejącego testu podglądu wiadomości w operations-language. Osobny przebieg całego tego pliku: 11/11. Końcowy przebieg testów grup i sprzedaży: 8/8.

## Referencje i wygląd

Odczytany manifest `sekaro-manifest-88-v0.1.md` wskazuje plan (0 wygenerowanych PNG), a nie zaakceptowany zestaw ekranów. W bieżącym wyszukiwaniu nie udało się uzyskać obrazów CRM odpowiadających d01–d22. Nie potwierdzamy zgodności 1:1 z makietami. Dostępne informacje o systemie wizualnym wykorzystano poprzez istniejące komponenty i tokeny.

Odbiór na działającym demo nowego pakietu pozostaje do wykonania po wdrożeniu: obie wersje motywu, mobilna nawigacja oraz kontakt → grupa → kampania w przeglądarce. Funkcjonalnego odbioru starszego etapu 6 nie traktujemy jako odbioru nowych ekranów.

## Wdrożenie i krótki odbiór

Jedna gałąź: `work/crm-navigation-groups-2026-10-05`. Operator aktualizuje istniejące demo skryptem `scripts/sekaro-demo.sh up`, z zachowaniem override PG17 i konfiguracji demo. Nie zmieniać produkcji ani main.

Po wdrożeniu: zaznaczyć dwa istniejące kontakty → „Dodaj do grupy” → nowa grupa; w CRM/Grupy wyszukać i dodać trzeciego, usunąć jednego członka i potwierdzić obecność jego profilu; w odbiorcach kampanii wybrać tę grupę, sprawdzić liczniki i ponowić dodanie (bez duplikatów). W demo sending_enabled i scheduler_enabled pozostają false.

## Odbiór demo po aktualizacji obrazu (05.10, wieczór)

- Nowa nawigacja CRM widoczna. Szanse, zadania i kalendarz dostępne przez wspólne zakładki; zapisane wcześniej spotkanie QA jest widoczne.
- Utworzono grupę `QA CRM — 05.10 odbiór` (ID 4). Wyszukiwanie istniejących kontaktów działa. Dodano kontakty 8 i 9; usunięto członkostwo 8. Grupa ma 1 członka także po pełnym przeładowaniu.
- Profil kontaktu 8 zachowany wraz z kampanią i historią dwóch wiadomości.
- W wstrzymanej kampanii QA (ID 7) wybór grupy domyślnie pominął kontakt 9 jako już przypisany do innej kampanii. Po wyłączeniu globalnego pomijania dodano go do kampanii 7. Ponowienie przy nadal wyłączonym globalnym pomijaniu zwróciło 0 dodanych, 1 już przypisany. Nie uruchamiano kampanii; banner demo nadal potwierdza zablokowaną wysyłkę/synchronizację.
- Pozostawiono grupę QA i odbiorcę w kampanii QA jako dane odbioru.
- Zrzut jasnego widoku grup: `2026-10-05-crm-group-live.jpg`.
- Wykryto ściskanie wyszukiwarki odbiorców przez komunikat wyniku. Poprawka CSS przenosi komunikat do pełnego wiersza i zachowuje minimalną szerokość wyszukiwania. Ta poprawka wymaga kolejnego zbudowania obrazu; nie jest jeszcze odebrana na demo.
- Ten odbiór nie potwierdza Dark/mobile ani zgodności 1:1 z brakującymi PNG.

### Poprawiona procedura aktualizacji

`sekaro-demo.sh up` nie buduje obrazu. Po przełączeniu commita najpierw wykonać `docker build --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" -t sekaro:local .`, następnie `bash scripts/sekaro-demo.sh up`. Bez kroku build uruchamiana jest poprzednia wersja obrazu mimo nowego HEAD.
