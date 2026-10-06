# Instalacja i utrzymanie Sekaro

Ta instrukcja dotyczy kodu pakietu 11. Wybierz jego zatwierdzony commit; wcześniejszy main może nie mieć instalatora. Operator wykonuje wdrożenie na swoim serwerze.

## Wymagania

- Linux, Git, Python 3.10+, Docker Engine i Compose v2 z obsługą `up --wait`.
- Uprawnienia do Dockera, wolne miejsce na obraz, dump i kopie oczekujące na transfer.
- Dostęp do repozytorium, npm/PyPI podczas budowania i rejestrów obrazów.
- Prywatny dostęp do panelu przez HTTPS proxy/tunel. Domyślne bindowanie pozostaje `127.0.0.1`.
- Opcjonalny ClamAV potrzebuje dodatkowej pamięci (overlay ogranicza go do 3 GiB); dostosuj zasoby do danych i liczby użytkowników.

Instalator nie instaluje pakietów systemowych, Dockera, proxy ani certyfikatów TLS. Nie otwiera publicznych portów.

## Nowa instalacja

```bash
git clone https://github.com/Lipskus/Sekaro.git
cd Sekaro
git switch --detach <zatwierdzony-commit>
python3 scripts/sekaro-install.py check
python3 scripts/sekaro-install.py install
```

`install` odmawia nadpisania `.env` lub istniejącej konfiguracji demo. Tworzy `.env` z losowymi hasłami i kluczami, uprawnieniami `0600`, katalog `backups` oraz `.sekaro-install/compose.json` wskazujący PostgreSQL 17 dla **nowej** instalacji. Następnie buduje aplikację, czeka na gotowość i sprawdza etykietę commitu.

Otwórz `http://127.0.0.1:5050` przez własny bezpieczny dostęp i przejdź tworzenie administratora. Ustaw właściwy `BASE_URL` w `.env` dla publicznych linków i OAuth, następnie zaktualizuj kontener. Nie wpisuj haseł do zgłoszeń ani logów diagnostycznych.

Przechowuj poza serwerem `.env`, `.sekaro-install/`, konfigurację proxy i hasło szyfrowania kopii. Klucz `SEKARO_ENCRYPTION_KEY` jest potrzebny do odszyfrowania poświadczeń zapisanych w bazie. Backup bazy nie zastępuje kopii konfiguracji wdrożenia.

Jeżeli pierwsze budowanie się nie powiedzie, konfiguracja pozostaje na dysku. Usuń przyczynę i dokończ ręcznie zgodnie z wyświetlonym błędem; nie kasuj plików ani wolumenów z danymi. `update` wymaga działającej bazy, aby wykonać kopię przed zmianą.

## Aktualizacja

```bash
cd /opt/sekaro
git fetch origin <branch-wydania>
git switch --detach <dokladny-commit>
python3 scripts/sekaro-install.py update
python3 scripts/sekaro-install.py status
```

Aktualizator:

1. Sprawdza Docker/Compose i czystość śledzonych plików Git.
2. Rozpoznaje demo po `.sekaro-demo/env`; dodaje istniejący `.sekaro-demo/pg17.compose.json`.
3. Uruchamia `pg_dump -Fc` we właściwym kontenerze bazy. Niepełny dump nie staje się poprawną kopią; błąd zatrzymuje aktualizację.
4. Zachowuje obraz działającego kontenera jako `sekaro:previous`.
5. Buduje `sekaro:local` z `org.opencontainers.image.revision`, uruchamia usługi i porównuje rewizję.

Lokalne dumpy w `backups/before-update/` mają `0600`, ale **nie są szyfrowane i nie mają automatycznej retencji**. Zabezpiecz dysk; usuń stare ręcznie dopiero po potwierdzeniu kopii i odtwarzania. Automatyczne zdalne kopie `.qbk` są osobnym mechanizmem.

Aktualizator nie zmienia głównej wersji istniejącej bazy. Nie podmieniaj obrazu PG15 na PG17 przy tym samym wolumenie bez właściwej migracji. Zachowaj istniejące override i wykonane wcześniej kopie migracyjne.

## Diagnostyka

```bash
python3 scripts/sekaro-install.py check
python3 scripts/sekaro-install.py status
python3 scripts/sekaro-install.py backup
```

`check` nie modyfikuje instalacji. `backup` tworzy lokalny dump tej samej bazy, którą rozpoznaje aktualizator. `status` pokazuje stan Compose.

| Objaw | Działanie |
|---|---|
| Zmodyfikowane śledzone pliki | Przejrzyj `git diff`; zachowaj celowe zmiany. Nie używaj automatycznie `reset --hard`. |
| Błąd backupu przed aktualizacją | Sprawdź stan DB, wolne miejsce i konfigurację; aplikacja nie jest wtedy podmieniana. |
| Build zakończony błędem | Działający kontener pozostaje; sprawdź log budowania i dostęp do rejestrów. |
| Aplikacja po aktualizacji unhealthy | Zachowaj logi bez sekretów; sprawdź migracje i DB. Nie przywracaj automatycznie starszego obrazu do nowszego schematu. |
| Inny commit w kontenerze | Nie uznawaj wydania za wdrożone; sprawdź nazwę projektu Compose, obraz i override. |
| Brak klucza szyfrowania | Przywróć oryginalny klucz z bezpiecznej kopii; losowy nowy klucz nie odblokuje danych. |

## Opcjonalny antywirus

```bash
python3 scripts/sekaro-install.py install --antivirus
# albo dla istniejącej produkcji:
python3 scripts/sekaro-install.py update --antivirus
```

Flaga dotyczy produkcyjnego Compose, nie demo. Utrwala wybór w `.sekaro-install/antivirus`, a kolejne aktualizacje zachowują `docker-compose.antivirus.yml`. ClamAV nie ma publicznego portu; pobiera sygnatury i skanuje **odszyfrowany dump przed podglądem odtwarzania**. Nie skanuje całego serwera ani całej korespondencji. Bez flagi skaner nie jest potrzebny.

Jeżeli skaner jest włączony, jego niedostępność, wykrycie zagrożenia i przekroczenie limitu blokują odtwarzanie. Zaczekaj na pobranie sygnatur po pierwszym starcie. Dla dużych baz ustaw odpowiednie limity ClamAV (`StreamMaxLength` itd.) w jego konfiguracji i sprawdź odtwarzanie na izolowanej bazie. Maksimum zdalnego transferu aplikacji wynosi 512 MiB.

## Cofnięcie i odtwarzanie

`sekaro:previous` ułatwia odzyskanie poprzedniego obrazu, ale nie jest automatycznym rollbackiem danych. Po migracji może być wymagane równoczesne odtworzenie bazy sprzed aktualizacji. Najpierw sprawdź procedurę na izolowanej bazie, następnie w oknie serwisowym. Patrz [BACKUPS.md](BACKUPS.md).
