# Etap 4 — stabilna baza i operacje

Jeden pakiet oparty na wdrożonym etapie 3 (`ea78e1d`). Nie zmienia numeru produktu na 1.0. Macierz poniżej rozróżnia kod gotowy do użycia od prób, które wymagają hosta Docker.

## Wspierana aktualizacja

| Źródło | Cel | Sposób | Dowód przed zamknięciem etapu |
|---|---|---|---|
| Istniejące demo PostgreSQL 15, `docker-compose.demo.yml` | PostgreSQL 17, nowy wolumen | `python3 scripts/upgrade-demo-postgres.py` | Odtworzenie dumpu, zgodne liczby i sygnatury danych wszystkich tabel `public`, zdrowy kontener aplikacji |
| Bieżąca aplikacja na PG15 | Ten sam PG15 z poprawkami etapu 4 | Zbudowanie i odtworzenie kontenera app | Testy backendu; nadal można pozostać na PG15 |
| Produkcyjny PG15 | PG17 | Kontrolowane dump/restore w oknie serwisowym, według tej samej zasady | Oddzielna próba na kopii danych operatora; skrypt demo nie dotyka produkcji |
| Inne silniki/major, `pg_upgrade` in-place, klaster HA | — | Poza potwierdzoną macierzą | Nie wykonuj przez skrypt demo |

Aplikacja zawiera jawnie klienta PostgreSQL 17 (`python:3.12-slim-trixie`, `postgresql-client-17`). Nie zmieniamy automatycznie obrazu bazy nad starym katalogiem danych. Format danych PG15 nie jest otwierany serwerem PG17.

### Aktualizacja istniejącego demo

Po pobraniu dokładnego commita etapu 4 i zbudowaniu `sekaro:local` uruchom:

```bash
python3 scripts/upgrade-demo-postgres.py
```

Skrypt najpierw pobiera obraz docelowy, potem zatrzymuje **tylko demo-app**. Zapisuje dump z prawami 0600 w `.sekaro-demo`, uruchamia tymczasowy serwer PG17 bez sieci i bez portów, odtwarza bazę w jednej transakcji i porównuje wszystkie tabele. Sygnatura tabeli zawiera liczbę rekordów oraz dwie sumy połówek MD5 pełnych wierszy JSONB (kontrola spójności, nie podpis kryptograficzny backupu). Dopiero zgodny wynik pozwala przełączyć istniejącą usługę `demo-db` na nowy wolumen i uruchomić aplikację. To nie tworzy drugiej aplikacji ani drugiego demo.

Pliki pozostające po operacji:

- `.sekaro-demo/pg17.compose.json`: trwały override obrazu i wolumenu. **Należy go używać przy każdym późniejszym uruchomieniu Compose**.
- `.sekaro-demo/sekaro-pg17-check-*.dump`: kopia przed zmianą.
- `.sekaro-demo/sekaro-pg17-check-*.json`: raport sygnatur.
- Oryginalny wolumen PG15: pozostaje nienaruszony; skrypt nigdy nie usuwa wolumenów.

`scripts/sekaro-demo.sh` automatycznie dołącza override. Ręczne wywołanie samego bazowego Compose po aktualizacji wskazałoby ponownie starą bazę — nie używaj wcześniejszych skróconych poleceń wdrożenia. Dotychczasowe `reset/remove` nie usuwają nowego zewnętrznego wolumenu PG17; jego trwałe usunięcie jest osobną, świadomą operacją operatora.

Jeżeli odtworzenie albo porównanie się nie powiedzie, stara baza pozostaje aktywna i skrypt uruchamia aplikację na niej. Jeżeli błąd wystąpi po przełączeniu, skrypt odkłada niedziałający override, wraca do PG15 i uruchamia aplikację. Błąd samego przywracania usług wymaga interwencji administratora — nie deklarujemy gwarantowanego automatycznego rollbacku przy awarii Dockera/hosta.

### Powrót po zakończonej aktualizacji

Przed użyciem tej ścieżki upewnij się, że chcesz wrócić do danych z chwili aktualizacji: późniejsze zapisy do PG17 nie trafią do starego PG15. Zachowaj oba wolumeny i wykonaj kopię aktualnego PG17.

```bash
cd /opt/sekaro
# Zatrzymaj app wskazując aktualną bazę.
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml -f .sekaro-demo/pg17.compose.json stop demo-app
mv .sekaro-demo/pg17.compose.json .sekaro-demo/pg17.compose.rollback.json
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml up -d --no-deps --force-recreate --wait demo-db
docker compose --env-file .sekaro-demo/env -p sekaro-demo \
  -f docker-compose.demo.yml up -d --no-deps --force-recreate --wait demo-app
```

Nie wykonuj `down -v` ani `docker volume prune` w ramach aktualizacji/rollbacku.

## Backup i restore

- `pg_dump` i `pg_restore` dostają dane logowania przez środowisko procesu, bez hasła w argv. Surowy stderr nie trafia do odpowiedzi API ani zwykłego logu — może zawierać SQL i prywatne dane.
- Każdy niezerowy kod `pg_restore`, także **1**, jest błędem. `--single-transaction --exit-on-error` zapobiega zaakceptowaniu częściowego odtworzenia. `--no-owner --no-acl` pozwala odtworzyć bazę bez odtwarzania obcych właścicieli i grantów.
- Pliki lokalnej kopii mają prawa 0600 i unikalną nazwę z mikrosekundami. Nadal dostępny jest istniejący szyfrowany pakiet `.qbk` i jego podgląd; surowy dump używany podczas upgrade'u nie jest szyfrowanym `.qbk`.
- Tokeny tymczasowego restore mają ścisły format, cel (`admin`/`setup`), TTL i jednorazowe zużycie. Ścieżka odczytu musi być dokładnie plikiem danego tokenu w chronionym katalogu; odrzucamy wyjście poza katalog i dowiązania.
- Restore przez API wymaga **restartu** aplikacji z `SEKARO_MAINTENANCE=1`. W tym trybie nie startuje scheduler, synchronizacja, zadania startup ani MCP; zwykłe trasy aplikacji są blokowane. Dostępne pozostają logowanie, backup/restore i zasoby potrzebne do otwarcia formularza.
- Przed restore zatrzymaj też publiczny moduł rezygnacji i wszystkie dodatkowe procesy korzystające z tej bazy. Flaga aplikacji nie zatrzymuje innych kontenerów ani klientów SQL.
- Po restore aplikacja wykonuje migracje i odczyt konfiguracji, ale w trybie maintenance nie przelicza automatycznie kolejki. Sprawdź dane i blokady, ponownie nadaj uprawnienia modułu publicznego, następnie świadomie usuń flagę maintenance i zrestartuj app. Dopiero zwykły start przywraca harmonogram.

Kopia samej bazy nie zastępuje zabezpieczenia klucza szyfrowania skrzynek, sekretu podpisu, `.env`/`.sekaro-demo/env` i ewentualnych plików poza DB. Przechowuj je osobno w chronionym backupie. Test odtworzenia jest częścią odbioru, nie tylko sprawdzenie, że plik istnieje. Dumpy odtwarzaj wyłącznie z zaufanego źródła — dump PostgreSQL może zawierać wykonywalny SQL.

## Granica prywatne/publiczne

| Powierzchnia | Dostęp docelowy |
|---|---|
| Panel, logowanie, `/api/*`, dokumentacja API, MCP | Wyłącznie prywatna sieć/Zero Trust; app bind `127.0.0.1:5050` |
| `/o/*`, `/c/*`, Beacon, OAuth, narzędzia Caddy | Nie są wystawiane przez nowy moduł publiczny. Nie dodajemy wyjątków na publicznym proxy. |
| `GET /u/{token}` i `POST /u/{token}` | Jedyna funkcja publicznego procesu, na osobnej domenie HTTPS |
| Inne trasy na domenie publicznej | 404; brak SPA, panelu, dokumentacji i logowania |
| PostgreSQL | Brak portu hosta; dwie sieci Docker, publiczny proces nie współdzieli sieci z aplikacją |

`public_unsubscribe` ma własny minimalny obraz i zależności. Nie importuje prywatnej aplikacji, nie ma haseł skrzynek, klucza szyfrowania ani JWT. Dostaje tylko login DB `sekaro_unsubscribe`, który może wykonać jedną funkcję zwracającą boolean. Nie może czytać tabel kontaktów, użytkowników i skrzynek. Funkcja `SECURITY DEFINER` ma stały `search_path` i kwalifikowane nazwy tabel; token jest parametrem, nie fragmentem SQL.

Rezygnacja jest idempotentna, zapisuje globalną suppression, wstrzymuje wszystkie przypisania adresu i usuwa niewykonane sloty. Sloty z niepewną próbą `SendAttempt` pozostają wraz z audytem. Blokada wierszy kontaktu współpracuje z ostatnią kontrolą przed wysyłką; wiadomości już przekazanej transportowi nie można cofnąć. Publiczny proces nie wykonuje webhooków ani wysyłki.

Nie zapisujemy tokenów w access logu publicznego procesu/proxy. Odpowiedzi mają `no-store`, `no-referrer`, CSP i zakaz osadzania. Nie zmieniamy zewnętrznej konfiguracji Cloudflare ani nie wystawiamy nowej domeny w ramach tego pakietu.

### Uruchomienie publicznej rezygnacji — produkcja

1. W prywatnym `.env` ustaw `SEKARO_UNSUBSCRIBE_BASE_URL=https://<osobna-domena>` i losowe `SEKARO_UNSUBSCRIBE_PASSWORD` (32–128 znaków URL-safe). Zachowaj istniejące klucze szyfrowania aplikacji. Domeny/proxy wymagają osobnego przygotowania operatora.
2. Zbuduj prywatną aplikację i uruchom jej migracje. Nadaj uprawnienia z prywatnego kontenera:

   ```bash
   docker compose -f docker-compose.sekaro.yml exec -T app python -m app.provision_unsubscribe
   ```

3. Dopiero po sukcesie provisioning uruchom publiczną usługę:

   ```bash
   docker compose -f docker-compose.sekaro.yml --profile public-unsubscribe up -d --build unsubscribe
   ```

4. Podepnij dedykowany host HTTPS do loopback 5051, zgodnie z `deploy/public-unsubscribe.nginx.conf`. Nie kieruj go do 5050. Ustaw limity żądań na hostowym proxy. Sprawdź z zewnątrz: nieprawidłowy token 404, `/api/auth/login`, `/docs`, `/o/*`, `/c/*` i `/` również 404. Użyj jednego fikcyjnego kontaktu/tokena do potwierdzenia rezygnacji w DB.

Profil jest opcjonalny przy aktualizacji istniejącej instalacji, aby brak nowej domeny/hasła nie uruchamiał częściowo skonfigurowanej usługi. Docelowe wdrożenie z tym profilem ma trzy usługi: app, db, unsubscribe. Demo pozostaje jednym demo bez publicznego transportu.

Po restore ponów provisioning, zanim uruchomisz usługę publiczną: restore celowo nie odtwarza grantów. Zmiana hasła wymaga odtworzenia kontenera unsubscribe. Provisioning odmawia użycia roli uprzywilejowanej, należącej do innych ról, posiadającej relacje lub nadal czytającej tabele przez granty PUBLIC.

Wysyłka używa oddzielnego originu rezygnacji w obu ścieżkach kolejki. Ani HTML href, ani tekstowy link rezygnacji nie zostaje opakowany w tracking prywatnej aplikacji. Dotychczasowe linki pozostają takie, jakie wysłano wcześniej; przed produkcyjną migracją istniejącej domeny zaplanuj zachowanie ich routingu.

## Bramka 1.0

Kod i testy lokalne nie są potwierdzeniem odtworzenia na VPS, konfiguracji DNS/TLS ani izolacji rzeczywistych sieci Docker. Etap wymaga raportu z aktualizacji demo oraz kontroli granicy publicznego deploymentu. Numer 1.0 pozostaje niezatwierdzony; wcześniejsze ograniczenia porównań makiet i pełnej lokalizacji nadal obowiązują. CRM pozostaje etapem 5.

Źródła techniczne: [PostgreSQL — aktualizacja klastra](https://www.postgresql.org/docs/17/upgrading.html), [pg_restore: transakcja i obsługa błędów](https://www.postgresql.org/docs/17/app-pgrestore.html), [klient PG17 w Debian Trixie](https://packages.debian.org/trixie/postgresql-client-17).
