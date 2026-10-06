# Backup i odtwarzanie

## Cztery oddzielne elementy

| Element | Przeznaczenie |
|---|---|
| `.qbk` | Przenośna kopia bazy, manifest i opcjonalne szyfrowanie AES-GCM; dotychczasowy format zachowano dla zgodności. |
| Zdalny cel | Opcjonalny S3, SFTP lub FTPS. Zdalne transfery wymagają zaszyfrowanego `.qbk`. |
| Konfiguracja wdrożenia | `.env`, katalog instalatora/demo i klucz szyfrowania poświadczeń. Zabezpiecz osobno poza serwerem. |
| Dump przed aktualizacją | Lokalny `pg_dump -Fc` w `backups/before-update`, bez szyfrowania i automatycznej retencji. Nie jest plikiem `.qbk`. |

## Konfiguracja w panelu

Administrator otwiera ustawienia backupu. Najpierw zapisuje hasło szyfrowania (co najmniej 8 znaków) i włącza szyfrowanie automatycznych kopii. Ustawia dotychczasowy harmonogram cron oraz ewentualną zwykłą kopię lokalną. Następnie wybiera opcjonalny cel zdalny. Aplikacja obsługuje **jeden zapisany cel naraz**.

Zapis nie testuje połączenia i nie wysyła danych. Osobny przycisk testuje utworzenie, odczyt i usunięcie niewrażliwego pliku próbnego. Dopiero „Uruchom kopię teraz” lub harmonogram tworzą kopię bazy.

Nowe dane dostępowe są szyfrowane w bazie kluczem `SEKARO_ENCRYPTION_KEY`. API zwraca tylko informację, czy sekret jest zapisany. Puste pole sekretu przy zapisie tej samej usługi zachowuje poprzedni sekret; zmiana rodzaju usługi wymaga nowych poświadczeń. Hasło backupu jest szyfrowane przy ponownym zapisie; wcześniejsze wartości pozostają odczytywalne. Aby przepisać stare hasło do postaci szyfrowanej, zapisz ponownie ustawienia szyfrowania przy prawidłowym kluczu.

## Dostawcy

| Typ | Wymagania |
|---|---|
| S3 | Bucket, access key, secret key, region; opcjonalny endpoint kompatybilny z S3 tylko jako origin HTTPS. Walidacja certyfikatu TLS pozostaje włączona. |
| SFTP | Host, port (domyślnie 22), użytkownik, hasło i zweryfikowany odcisk klucza hosta `SHA256:…`. Ten pakiet obsługuje hasło, nie import klucza prywatnego klienta. |
| FTPS | Host, port (domyślnie 21), użytkownik, hasło. Explicit TLS, weryfikacja certyfikatu oraz szyfrowanie kanału danych (`PROT P`). Implicit FTPS/990 i zwykły FTP nie są obsługiwane. |

Utwórz istniejący bucket S3 oraz konto o ograniczonym dostępie do wybranego prefiksu. Wymagane operacje: zapis, odczyt, listowanie i usuwanie w tym prefiksie. Dla SFTP/FTPS katalog jest względny wobec katalogu logowania; aplikacja tworzy brakujące podkatalogi. Nie używaj `..` ani katalogu całego serwera. Ustal odcisk SFTP innym zaufanym kanałem z administratorem hosta — nie akceptuj automatycznie nieznanego klucza.

Każda instalacja ma losową przestrzeń nazw pod wskazanym prefiksem. Retencja obejmuje tylko rozpoznane nazwy plików tej przestrzeni. Odtworzona baza zachowuje jej identyfikator. Inna nowa instalacja nie zobaczy automatycznie kopii poprzedniej; można pobrać je klientem dostawcy i wczytać w formularzu „Przywróć z pliku”.

Destynacje konfiguruje administrator. Serwery prywatne/LAN są dopuszczalne; zabezpiecz egress aplikacji na poziomie infrastruktury, jeżeli potrzebna jest ścisła lista dozwolonych hostów. Nie udostępniaj tego konta administratora niezaufanym użytkownikom.

## Integralność, retencja i awarie

- Limit pojedynczego zdalnego pliku: **512 MiB**; pakiet jest przetwarzany w pamięci, więc potrzebny jest odpowiedni zapas RAM.
- Przed transferem zaszyfrowany plik trafia do `backups/remote-pending/` z uprawnieniami `0600`.
- Aplikacja wysyła kopię, pobiera ją ponownie i porównuje SHA-256. Dopiero po tym usuwa nadmiar najstarszych zdalnych kopii (1–365, domyślnie 14).
- Po pełnym powodzeniu usuwa plik oczekujący. Jeżeli chcesz zachować także regularne lokalne kopie, włącz istniejącą opcję zapisu lokalnego.
- Błąd transferu lub retencji pozostawia kopię oczekującą i zapisuje niepowodzenie. Nie ma automatycznego ponawiania tego samego pliku ani automatycznego czyszczenia nieudanych kopii; obserwuj miejsce na dysku.
- Historia pokazuje ostatnich 100 zapisów. `pending` po restarcie może oznaczać przerwaną operację; sprawdź plik lokalny i zdalny przed ręcznym porządkowaniem.
- W demo transfery, test połączenia i pobieranie zewnętrzne są zablokowane. Harmonogram demo nie działa.

Zdalny backup wymaga włączonego lokalnego magazynu (`QUICKLY_LOCAL_DISK_BACKUPS=1`) oraz trwałego montowania `backups`. Produkcyjny Compose ustawia to automatycznie. Samo włączenie szyfrowania bez hasła **zatrzymuje** pakowanie; nie powoduje cichego zapisu bez szyfrowania.

## Odtwarzanie `.qbk`

1. Najpierw wykonaj próbę na izolowanej instancji z wyłączoną wysyłką i harmonogramem.
2. Zachowaj bieżącą bazę oraz oryginalną konfigurację wdrożenia i klucz poświadczeń.
3. W panelu wybierz lokalny plik albo odśwież listę zdalnych kopii i kliknij „Wczytaj do przywracania”. To wyłącznie pobranie do formularza.
4. Przeczytaj metadane, podaj hasło i uruchom podgląd. Aplikacja odszyfruje dump, opcjonalnie przeskanuje go ClamAV, zweryfikuje narzędziami PostgreSQL i przygotuje krótko ważny token.
5. Porównaj podsumowanie z obecną bazą. Dopiero osobne potwierdzenie zastępuje **całą bazę**, a nie wybrane kontakty.
6. Po przeładowaniu sprawdź logowanie, liczbę kontaktów, relacje, kampanie, zadania i stan skrzynek. Nie uruchamiaj wysyłki, dopóki kontrola nie jest zakończona.

Hasło `.qbk` i `SEKARO_ENCRYPTION_KEY` to różne rzeczy. Bez pierwszego nie otworzysz zaszyfrowanej kopii; bez oryginalnego drugiego nie odczytasz zapisanych poświadczeń skrzynek i zdalnego backupu po odtworzeniu.

## Surowy dump przed aktualizacją

Plik `.dump` z instalatora nie ma manifestu `.qbk` i nie jest przeznaczony do formularza `.qbk`. Odtwarza się go narzędziem `pg_restore` do przygotowanej bazy PostgreSQL, przy zatrzymanej aplikacji, zgodnie z wersją schematu i obrazu. Nie wykonuj `pg_restore --clean` na działającej produkcji bez zatwierdzonego okna serwisowego oraz sprawdzonej kopii. Obraz `sekaro:previous` nie cofa sam bazy.

## Źródła techniczne

- [Boto3 S3](https://docs.aws.amazon.com/boto3/latest/reference/services/s3.html)
- [Paramiko SSHClient i polityka klucza hosta](https://docs.paramiko.org/en/stable/api/client.html)
- [Python FTP_TLS](https://docs.python.org/3/library/ftplib.html#ftplib.FTP_TLS)
- [ClamAV INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)

Stan weryfikacji i brakujące próby operatora: [STAGE_11_RELEASE.md](STAGE_11_RELEASE.md).
