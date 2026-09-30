# P0 — zamknięta lista pozostałych prac

Stan bazowy: zdalny branch `fix/p0-safety-sekaro-identity-2026-09-29`, commit `0a078ab74326b082391bd01be0506063febd19af` (sprawdzony 30.09.2026). Lokalny odpowiednik przed pracą: `d8860c0`; różne SHA publikacji nie są dowodem różnicy funkcjonalnej.

Obowiązuje `docs/RELEASE_EXECUTION_PLAN.md`: 11 etapów w niezmienionej kolejności. Etap 2 to archiwizacja obecnego Lead i ochrona historii; rdzeń CRM pozostaje etapem 5, sprzedaż 6, automatyzacje 7, użytkownicy 8. Propozycja warunkowego odbioru P0 z 29.09 nie jest akceptacją.

## Zasada wydania

Pozostały P0 tworzy **jeden zbiorczy pakiet do odbioru**. Commity robocze i raporty nie stanowią wydań do instalacji. Komenda aktualizacji pojawi się dopiero z kompletnym pakietem i bilansem bramek. Nie wymagamy od użytkownika przebudowy serwera po każdym module.

## Zamknięty zakres

| ID | Istniejący zakres | Warunek ukończenia | Stan roboczy 30.09.2026 |
|---|---|---|---|
| P0-01 | Odbiorcy kampanii, statusy, filtry, dodawanie/import i eksport | PL/EN/DE/RU; te same kody API, zaznaczenia i dane po zmianie języka; anulowane potwierdzenie bez mutacji | Wykonane lokalnie; regresje i 48 widoków z P0-02 sprawdzone |
| P0-02 | Analityka kampanii i globalna | Lokalizacja etykiet, zakresów, walidacji, CSV, danych liczbowych; zachowane filtry i źródła wskaźników | Wykonane lokalnie; wspólny raport final-outreach |
| P0-03 | Szablony, wersje, podgląd i test | Lokalizacja; zachowanie szkicu; spójna blokada wysyłki w DEMO | Wykonane lokalnie; szkice, wersje, podgląd i DEMO sprawdzone |
| P0-04 | Skrzynki, edytor SMTP/IMAP, retencja, archiwum | Lokalizacja istniejących przepływów; zachowane trzy tryby retencji i ustawienia; bez nowych adapterów | Wykonane lokalnie: formularze, retencja, archiwum i tracking; końcowy odbiór w P0-08/09/10 |
| P0-05 | Harmonogram, kalendarz i podgląd | Lokalizacja; poprawne strefy czasu, filtry i stany; bez nowych operacji kolejki | Wykonane lokalnie; strefy czasu, filtry, kalendarz i podgląd sprawdzone |
| P0-06 | Powiadomienia i konfiguracja | Lokalizacja; zachowane filtry i niezapisane ustawienia | Wykonane lokalnie; preferencje, filtry i zdarzenia sprawdzone |
| P0-07 | Ustawienia, stan systemu, domeny, porady, dashboard | Lokalizacja istniejących kontrolek, komunikatów i dat; bez tworzenia brakujących pomiarów | Wykonane lokalnie; ustawienia, stan systemu i porady odzyskane i sprawdzone — raport p0-recovery; końcowy odbiór P0-08/09/10 otwarty |
| P0-08 | Wspólne błędy, potwierdzenia, Dark/Light, klawiatura, responsywność | Regresje całego pakietu; DE/RU na 1600/768/390 px, PL/EN kontrolnie; brak utraty danych i przepełnień | W toku; 84 dodatkowe kontrole DE/RU, poprawiony nagłówek na telefonie |
| P0-09 | Porównanie referencyjne istniejących widoków i stanów | Macierz pokrycia 98 plansz: zgodne / naprawione / jawne odstępstwo / element przyszłego etapu; z dowodami, bez deklaracji pełnego 1:1 przed kontrolą | Otwarte |
| P0-10 | Regresja ochrony wysyłki i końcowy odbiór | Mockowany transport, wypisania, suppression, pause, DEMO; testy backend/frontend i build; raport z rzeczywistymi blokerami | Poprzednie dowody dostępne, finał otwarty |

Nie dopisujemy do P0 nowych funkcji CRM, raportów bez źródeł, adapterów ani instalatora. Upgrade/restore PostgreSQL, backup i izolacja publicznej rezygnacji należą do etapu 4 i nadal warunkują stabilne 1.0. To przypomnienie zatwierdzonego planu, nie przesunięcie prac.

Przegląd kodu obejmuje trasy z `frontend/src/App.jsx` i ich komponenty. Liczba statycznych polskich tekstów nie jest miarą procentowego ukończenia: część tekstów jest danymi użytkownika, przykładami lub starszym, nieużywanym UI. Tłumaczenia nie mogą zmieniać tych danych ani identyfikatorów API.

## Stan prac roboczych — 30.09.2026

- P0-01/02: implementacja lokalna i regresje zakończone w poprzednim punkcie kontrolnym. Dowody: `2026-09-30-p0-final-outreach-worklog.md`.
- P0-03/05/06: implementacja lokalna i regresje zakończone w bieżącym punkcie kontrolnym. Dowody: `2026-09-30-p0-final-operations-worklog.md`.
- P0-04: lokalna implementacja zakończona, łącznie z trackingiem Beacon/DNS, pomocą, stanami weryfikacji i komunikatami operacji. P0-07: dashboard i domeny wykonane lokalnie; pozostają ustawienia, stan systemu i porady. Bieżący raport: `2026-09-30-p0-tracking-dashboard.md`; wcześniejszy raport `2026-09-30-p0-mailbox-progress.md` opisuje poprzedni punkt kontrolny.
- P0-08/09/10 nadal blokują końcowe zamknięcie P0: regresja całego pakietu, porównanie 98 plansz i końcowa ochrona wysyłki. Lokalne ukończenie modułu nie oznacza jego końcowego odbioru referencyjnego.
- Etap 1 nadal trwa; etapy 2–11 nie zostały rozpoczęte. Pozostaje jeden zbiorczy pakiet do odbioru, bez nowych poleceń instalacji dla pojedynczych modułów.

### Punkt kontrolny po odzyskaniu

P0-07 zakończone lokalnie: ustawienia, diagnostyka i porady są objęte regresjami języka i 180 kombinacjami UI. Wcześniejsze wpisy powyżej opisują historię, nie aktualny brak implementacji tych modułów. Nadal otwarte P0-08 (regresja całego pakietu), P0-09 (98 plansz) i P0-10 (końcowy bilans odbioru). Nie przesuwamy ich do etapu 2. Raport `2026-09-30-p0-recovery.md` zawiera wyniki, ograniczenia i stan publikacji.
