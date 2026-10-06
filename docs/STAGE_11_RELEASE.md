# Pakiet 11 — instalator, backupy i odbiór końcowy

Stan 06.10.2026: **kod do odbioru na gałęzi wydania; nie stabilne 1.0**. Bez merge do main i bez wdrożenia przez agenta. Rozszerzenia pozostają częścią jednego etapu 11.

## Przygotowane zmiany

- CLI `scripts/sekaro-install.py`: check/install/update/status/backup; sekrety tylko na świeżej instalacji, backup przed aktualizacją, etykieta commitu i kontrola gotowości. Istniejący PG15 nie jest automatycznie zmieniany; demo zachowuje override PG17.
- Opcjonalny cel S3/SFTP/FTPS w dotychczasowych ustawieniach backupu, wspólny harmonogram, zaszyfrowane poświadczenia, test połączenia, retencja po weryfikacji odczytu, historia i pobranie do istniejącej ścieżki podglądu/odtwarzania.
- Lokalna kopia oczekująca przed transferem; błędy jej nie usuwają. S3/FTPS weryfikują TLS; SFTP wymaga przypiętego SHA256 klucza hosta. Demo nie wykonuje połączeń zewnętrznych.
- Naprawa cichego zapisywania bez szyfrowania przy brakującym haśle. Wynik ręcznego backupu nie zgłasza sukcesu, jeżeli żaden cel nie został wykonany.
- Opcjonalny ClamAV tylko dla odszyfrowanego dumpu przed podglądem odtwarzania. Gdy jest włączony, błąd skanera blokuje odtwarzanie.
- Favicon oparty na znaku Sekaro, nowy wersjonowany adres zasobu oraz zastąpienie dawnych plików ikony. Zachowano historyczny format `.qbk` i kompatybilne nazwy konfiguracji.
- Nowe README, instrukcja instalacji/aktualizacji i backupu/odtwarzania. Zrzut w README jest jawnie historycznym dowodem QA, nie nowym odbiorem.

## Weryfikacja wykonana

- Backend: **633 zaliczone, 9 pominiętych**; SQLite, bez rzeczywistego PostgreSQL w tym środowisku.
- Frontend: **280/280**; testy nowych pól, zmiany dostawcy, zachowania draftu po błędzie, blokady demo, języków i pobrania do podglądu bez uruchomienia restore.
- Build frontendu poprawny; pozostaje dotychczasowe ostrzeżenie o wielkości bundla.
- Nowe testy obejmują odrzucanie niebezpiecznej konfiguracji/nazw, brak cichej rezygnacji z szyfrowania, retencję po round-trip, zachowanie lokalnego pliku po awarii, maskowanie sekretów, brak sieci w demo, zachowanie PG17 override, brak nadpisania sekretów, prywatny dump przed aktualizacją oraz odmowę odtwarzania przy błędach ClamAV.
- Nie przekazano rzeczywistej bazy do chmury, nie użyto certyfikatów ani poświadczeń operatora i nie wysłano wiadomości.

## Otwarte bramki — nie oznaczać jako PASS

| Bramka | Stan i wymagany dowód |
|---|---|
| Instalacja Docker od zera i aktualizacja obecnego demo | Brak Dockera w środowisku wykonawczym; wymagane uruchomienie przez operatora, zdrowe kontenery i zgodna etykieta commitu. Testy CLI są mockowane. |
| Transfer S3/SFTP/FTPS | Wymagane testowe konta operatora: zapis, odczyt, retencja, przerwanie transferu i odzyskanie lokalnej kopii. Brak rzeczywistej próby dostawców w tej sesji. |
| PostgreSQL restore | Wymagana izolowana próba odtworzenia oraz porównanie danych. SQLite nie potwierdza migracji/współbieżności PostgreSQL. |
| ClamAV | Protokół i odmowy przetestowane z atrapą; rzeczywisty daemon, sygnatury i limity wymagają próby instalacyjnej. |
| Końcowe UI | **Otwarte.** Cloud Browser otworzył stronę Sekaro, ale udostępnił tylko banner demo; odczyt screenshotu i ponowne ładowanie kończyły się timeoutem. Lokalny Chromium nie został zainstalowany: pobrany plik dystrybucji nie był poprawnym archiwum. Nie uznano tego za test wizualny. |

## Checklista odbioru interfejsu po wdrożeniu

Przejść dashboard, kontakty/firmy, pipeline, zadania i kalendarz, kampanie/sekwencje, skrzynki/tożsamości, korespondencję, raporty, automatyzacje i wszystkie sekcje ustawień. Dla każdej pozycji zapisać wynik, błędy i dowód po poprawce.

- Desktop, tablet, telefon; Dark/Light; PL/EN/DE/RU.
- Spacing, wyrównanie, długie nazwy, zawijanie, brak poziomego wycieku i obciętych modali.
- Zmiana każdej kontrolki, zapis i ponowny odczyt; anulowanie nie zapisuje, błąd zachowuje draft.
- Loading/empty/error/success/disabled, fokus klawiatury i przewijanie modali.
- Klik wydarzenia kalendarza pokazuje szczegóły; edycja dopiero z przycisku.
- Nowy favicon po zwykłym i twardym odświeżeniu, bez dawnej błyskawicy Quickly.
- Backup: zmiana rodzaju celu, sekrety bez zwracania wartości, blokada testu dla niezapisanych zmian, status nieudanego transferu, odtworzenie wyłącznie po osobnym potwierdzeniu.

Istniejący `scripts/check-p0-ui.cjs` korzysta z atrap API. Może dostarczyć dowody layoutu w działającym Chromium, ale nie zastępuje prób integracyjnych dostawców i wdrożenia.
