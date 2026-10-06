# P0 — lokalizacja wspólnych formularzy i importu

Baza: branch `fix/p0-safety-sekaro-identity-2026-09-29`, commit `5907035a90ba7e57c6a37479629ea0e9b3ad6e96`. Remote i otwarte PR sprawdzone ponownie 30.09.2026: main pozostaje `ca9a544`, jedyny otwarty PR #37. Nie zmieniono ROADMAP.md ani kolejności etapów.

## Zakres

- Wspólne Modal, ConfirmContext i kontrolki stanu korzystają z istniejącego LanguageProvider: zamknięcie, anulowanie, potwierdzenie, retry, domyślny błąd, brak danych, etykieta sekcji i zapowiedź funkcji.
- ContactImport: od wyboru wczytania, poprzez mapowanie i wybór obsługi duplikatów, po wynik importu i informację o nieudanym odświeżeniu. PL, EN, DE i RU.
- FieldManager/FieldInput: etykiety, typy, opcje, edycja, niezapisane zmiany, usunięcie, potwierdzenie utraty wartości i informacja o nieudanym odświeżeniu.
- Usunięcie własnego pola przekazuje jawne `danger: true`; czerwony przycisk nie zależy od rozpoznania polskiego lub angielskiego słowa w przetłumaczonym komunikacie.
- Interpolacja używa zwykłego tekstu React. Nazwy plików, kolumn, pól, list, wpisane opcje i dane kontaktów nie są tłumaczone ani traktowane jako HTML. Klucze i enumy API pozostają niezmienione.
- Zmiana języka nie odmontowuje formularza, nie uruchamia ponownego uploadu i nie gubi szkicu/mapowania. Wewnętrzne komunikaty o udanym zapisie z błędem odświeżenia przechowują identyfikator tekstu, aby reagować na zmianę języka.
- Nowy słownik jest częścią istniejącego systemu języka, bez nowej biblioteki i bez drugiego kontekstu. Wspólne komponenty renderowane samodzielnie mają domyślny polski; aplikacja korzysta z LanguageProvider.
- Poszerzono select mapowania do 260 px: oględziny rosyjskiego mobile wykazały przycinanie nazw opcji przy wcześniejszych 150 px. Tabela nadal przewija się w nazwanym obszarze, bez poszerzania strony.

## Weryfikacja

- 144 testy frontendu / 17 plików: zaliczone. Dziewięć nowych przypadków obejmuje import w czterech językach z niezmienionym payloadem, zachowanie mapowania/listy/trybu duplikatów i szkicu pola po zmianie języka, bezpieczne podstawianie tekstu oraz anulowanie destrukcyjnych operacji po niemiecku i rosyjsku. API mockowane.
- Produkcyjny build: zaliczony. Nadal występuje wcześniejsze ostrzeżenie o wielkości chunka.
- Rozszerzono istniejący izolowany skrypt QA o `P0_UI_LANGUAGES`. 48 przypadków (import/pola × 4 języki × 2 motywy × 3 rozmiary) bez błędów JavaScript, przepełnienia dokumentu lub naruszenia badanych granic dialogu. Figtree załadowany.
- Po poszerzeniu mapowania: ponowna macierz 24 wariantów importu. Jej wynik zapisano w `evidence-2026-09-30/localization/import-final.json`.
- Wszystkie testy UI używały lokalnego buildu, mocków API i blokady zewnętrznych originów. Nie są dowodem nowego wdrożenia VPS. Bez prawdziwej wysyłki, importu do serwera ani usuwania danych.
- Zrzuty obejrzane w pełnym rozmiarze: pola DE mobile Light i tablet Dark, import RU tablet Dark i mobile Dark, import EN mobile Light; końcowy import RU mobile po poszerzeniu mapowania. Manifesty obejmują także pozostałe warianty; nie oznacza to pełnego ręcznego odbioru każdego PNG.

## Granice i dalsza kolejność

To wspólny pakiet w etapie 1/P0, bez migracji i bez zmiany numeru produktu. Nie oznacza pełnej lokalizacji wszystkich stron. Lista/profil kontaktów, kampanie, Inbox, analityka i inne treści modułów nadal wymagają kolejnych prac w P0. Komunikaty zwracane przez backend pozostają w języku źródłowym; nie tłumaczymy ich heurystycznie. Funkcje formatujące daty i eksportowane historyczne etykiety statusów nie zostały globalnie zmienione w tym pakiecie.

Nie zamknięto P0, nie zaakceptowano pełnego 1:1 ani nie rozpoczęto etapu 2. Zachowujemy zatwierdzoną kolejność. Backend nie został zmodyfikowany; nie powtarzano jego testów ani nie deklarowano testu PostgreSQL.

## Aktualizacja istniejącego demo

W katalogu repozytorium, na dotychczasowym branchu P0:

```bash
git pull --ff-only origin fix/p0-safety-sekaro-identity-2026-09-29 &&
docker compose -f docker-compose.sekaro.yml build --pull app &&
bash scripts/sekaro-demo.sh up
```

Weryfikacja po wdrożeniu: zmienić język na DE lub RU, otworzyć własne pola i podgląd importu testowego pliku, sprawdzić etykiety oraz anulować bez importowania/usuwania. Przestawienie języka nie tłumaczy danych użytkownika ani nie zmienia blokad wysyłki.
