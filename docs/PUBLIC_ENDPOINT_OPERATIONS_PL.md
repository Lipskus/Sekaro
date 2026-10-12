# Druga aktualizacja — publiczny endpoint i skrzynki

Pakiet na gałęzi `work/release-two-branding-2026-10-11`. Zawiera aktualizację 1,
ujednolicone logo i nowe funkcje opisane poniżej. Instalacja istniejącego Sekaro
zachowuje dotychczasowy sposób działania, dopóki administrator jawnie nie podłączy
nowej konfiguracji. **Nie przełącza automatycznie DNS ani starszego Beacon.**

## Co zmienia interfejs

W Skrzynkach przycisk **Dodaj skrzynkę** otwiera wybór SMTP/IMAP, Gmail albo
Microsoft 365. Połączenia OAuth są dostępne administratorowi. Gmail wymusza wybór
konta i ekran zgody; Microsoft 365 wymusza wybór konta. Podłączenie konta nie
uruchamia automatycznie kampanii. Sekcja **Publiczny endpoint** pokazuje tryb,
połączenie, kolejkę zdarzeń i zachowane starsze endpointy, bez ujawniania kluczy.

## Tryb aplikacji a rola instalacji

| Tryb | Publiczne funkcje | Kampanie |
|---|---|---|
| `private` | Brak nowych linków publicznych | Bez śledzenia i nagłówka rezygnacji; `{{unsubscribe_link}}` jest blokowane w preflight i przed wysyłką |
| `unsubscribe` | Rezygnacje | Bez śledzenia; link w treści i opcjonalny nagłówek |
| `tracking` | Rezygnacje, otwarcia, kliknięcia | Ustawienia śledzenia wybierane w kampanii |
| Bez pliku konfiguracji | Dotychczasowe działanie | Aktualizacja istniejącej instalacji zachowuje konfigurację legacy |

Przejście w tryb prywatny nie usuwa globalnych blokad. Starsze endpointy trzeba
zachować w konfiguracji z `retired: true`; są nadal synchronizowane i sprawdzane
przed wysyłką do kontaktów, dla których wcześniej wydały linki.

Trzy role instalatora dotyczą usług uruchamianych na konkretnym serwerze:

```bash
# Nowe prywatne Sekaro, bez publicznych linków:
python3 scripts/sekaro-install.py install --role private

# Nowe Sekaro i odseparowany endpoint na tym samym serwerze:
python3 scripts/sekaro-install.py install --role combined \
  --public-url https://links.example.org --endpoint-mode unsubscribe

# Tylko endpoint na drugim serwerze (nie tworzy bazy ani sekretów Sekaro):
python3 scripts/sekaro-install.py endpoint-install --sync-bind 10.20.0.2
```

Adres `10.20.0.2` musi należeć do właściwego interfejsu LAN/VPN serwera endpointu.
Rola combined domyślnie wiąże API do adresu bramy mostka Docker; można podać
`--sync-bind`. Oba porty standalone domyślnie wiążą się z `127.0.0.1`:
5051 to publiczne linki, 5052 to osobne API. Publiczny listener za lokalnym proxy
pozostaje na loopback. Nie ustawiaj `0.0.0.0` tylko po to, żeby obejść błąd połączenia.

Instalator nie ustawia DNS, proxy, tunelu ani zapory. Domyślne 192 MiB i 0,5 CPU są
limitami kontenera, a nie potwierdzonymi wymaganiami wydajnościowymi. Endpoint ma
osobny wolumen i wewnętrzną sieć Dockera, działa jako UID 10001, bez capabilities,
bez dostępu do wolumenu bazy, sekretów Sekaro i Docker socket. Konfigurację zapory
oraz rzeczywistą izolację od usług hosta trzeba sprawdzić na serwerze.

## Podłączenie istniejącego Sekaro

Bezpiecznie przenieś `.sekaro-endpoint/client.key` z hosta endpointu na prywatny
host Sekaro. Nie wysyłaj klucza w URL ani w poleceniu widocznym w historii powłoki.
Utwórz prywatny plik `endpoint-connection.json` z uprawnieniami 0600, przykładowo:

```json
{
  "mode": "unsubscribe",
  "endpoints": [{
    "id": "primary",
    "transport": "mesh",
    "public_url": "https://links.example.org",
    "sync_url": "http://10.20.0.2:5052",
    "key_file": "/root/sekaro-endpoint-client.key",
    "inbox_ids": []
  }]
}
```

```bash
python3 scripts/sekaro-install.py endpoint-connect --config endpoint-connection.json
python3 scripts/sekaro-install.py update
python3 scripts/sekaro-install.py status
```

Parowanie sprawdza autoryzację, protokół i tożsamość bazy endpointu, zapisuje pliki
prywatne, a aktualizacja montuje je tylko do aplikacji. Sekret identyfikatorów
kontaktów powstaje na hoście Sekaro; endpoint otrzymuje HMAC, nie adres e-mail.
`inbox_ids: []` to profil domyślny; można ustawić listę ID skrzynek, a jeden endpoint
obsługuje wiele skrzynek. Profile nie mogą mieć nakładających się list ani dwóch
domyślnych przypisań. Ta sama baza endpointu ma jeden profil.

Dla synchronizacji przez Internet użyj `https://` i ogranicz dostęp do maszyny
Sekaro. Oprócz aplikacyjnego klucza można podać:

- `access_id_file` i `access_secret_file` — Cloudflare Access Service Auth;
- `ca_file` — własny urząd certyfikacji;
- `cert_file` i `cert_key_file` — certyfikat klienta mTLS.

To ścieżki do lokalnych plików przed parowaniem. HTTP jest dozwolone jedynie po
jawnym wyborze `local`, `mesh` albo `lan`; nazwa trybu sama nie zapewnia szyfrowania
ani ACL. Klient nie używa proxy ze zmiennych środowiskowych ani przekierowań HTTP.
Stary profil oznacz `retired: true`, zamiast usuwać go po przeniesieniu skrzynek.

## Proxy i testy na serwerze

Publiczny hostname kieruj wyłącznie na port 5051. Dopuszcza on `/o/{token}`,
`/c/{token}`, `/u/{token}` i neutralne `/`. Nigdy nie kieruj go do portu 5052 ani
prywatnego Sekaro. GET rezygnacji wyświetla potwierdzenie; POST trwale zapisuje
rezygnację. Automatyczne skanowanie linku przez GET nie wypisuje odbiorcy.

API 5052 udostępnij tylko źródłu/tożsamości Sekaro. Dla tunelu rozdziel hostname
publiczny i Service Auth. Przy publicznym IP wymagane są TLS i właściwa allowlista.
Zweryfikuj oddzielnie IPv4/IPv6 oraz reguły dla publikowanych portów Dockera.
Samo `internal: true` nie zastępuje kontroli dostępu do usług hosta.

Przed włączeniem kampanii wykonaj na docelowej topologii:

1. Sprawdzenie z zewnętrznego klienta: linki bez logowania Access/CAPTCHA;
   `/v1/status` na publicznym hoście zwraca 404, prywatny panel nie jest wystawiony.
2. Sprawdzenie negatywne API: brak dostępu spoza dozwolonego źródła; brak klucza
   lub zły klucz nie daje dostępu. TLS, certyfikaty i Service Auth bez wyłączania weryfikacji.
3. Test kontrolowanego maila: otwarcie/kliknięcie, potwierdzona rezygnacja,
   trwały zapis w Sekaro; restart endpointu nie przywraca możliwości wysyłki.
4. Test awarii: odcięcie API wstrzymuje zależne wysyłki; niezależny endpoint działa.
5. Z kontenera endpointu potwierdź brak połączenia do bazy, panelu i pozostałych
   prywatnych usług. Zweryfikuj również porty hosta i trasy mesh.

Kod i testy lokalne nie zastępują tych testów sieciowych. Panel pokazuje wynik
połączenia i ciągłości, a nie certyfikat bezpieczeństwa całej topologii.

## Przeniesienie starych linków

Zatrzymaj kampanie. Zachowaj kopię bazy Sekaro, wolumenu endpointu i konfiguracji.
Odbierz zaległe zdarzenia ze starej usługi. Po podłączeniu nowego endpointu uruchom
w kontenerze aplikacji z jej konfiguracją:

```bash
python -m app.endpoint_client migrate-existing
```

Importer kopiuje istniejące tokeny rezygnacji i mapowania logów, w tym starsze
krótkie tokeny otwarć. Można uruchomić go ponownie. **Nie pobiera zaległych zdarzeń
z zewnętrznego Beacon.** Zachowaj stare domeny, certyfikaty i ścieżki `/o`, `/c`, `/u`;
dopiero po imporcie i sprawdzeniu przekieruj je do nowego publicznego listenera.
Importer nie naprawia DNS i nie odtwarza utraconych rezygnacji.

## Eksploatacja i odzyskiwanie

```bash
python3 scripts/sekaro-install.py endpoint-status
python3 scripts/sekaro-install.py endpoint-backup
python3 scripts/sekaro-install.py endpoint-update
python3 scripts/sekaro-install.py endpoint-rotate
# Przenieś nowy client.key i ponownie wykonaj endpoint-connect + update na Sekaro.
# Dopiero po sprawdzeniu nowego klucza:
python3 scripts/sekaro-install.py endpoint-revoke-old
```

Rotacja zachowuje poprzedni klucz do jawnego odwołania. Nie rób kolejnej rotacji,
zanim pierwsza zostanie zakończona. Backup wykorzystuje SQLite backup API, obejmuje
stan WAL i trafia do `.sekaro-endpoint/backups`. Przechowuj osobno, bezpiecznie także
`.sekaro-endpoint/env`, `server.keys`, `.sekaro-install/endpoint-client` i `.env`.
Kopia bazy bez prywatnego klucza HMAC/config nie wystarcza do pełnego odzyskania.

```bash
python3 scripts/sekaro-install.py endpoint-restore --backup-file /root/endpoint.sqlite3
# Tylko gdy bieżący wolumen jest niedostępny i jego backup nie może się udać:
python3 scripts/sekaro-install.py endpoint-restore --backup-file /root/endpoint.sqlite3 --skip-current-backup
```

Przywracanie wymaga zatrzymanych kampanii i analizy zgodności obu kopii. Świeża baza
endpointu ma inną tożsamość i blokuje wysyłkę; luka, zbyt stary stan endpointu lub
Sekaro również ją blokuje. Przywrócenie starszej kopii może stracić rezygnacje, które
nigdy nie trafiły do Sekaro — same kursory nie potrafią tego dowieść ani odtworzyć.
Nie kasuj kursora i nie paruj nowego pustego endpointu jako sposobu na usunięcie
błędu. Odtwórz kompletny trwały stan i uzgodnij blokady przed wznowieniem.

## Semantyka protokołu i ograniczenia

Wersja 1: rejestracja mapowań, status, pobieranie do 250 zdarzeń, potwierdzenie
kursora i sprawdzenie blokad. Żadne połączenie zwrotne do Sekaro nie jest potrzebne.
Efekty zdarzeń i kursor zapisują się razem; ACK następuje po zatwierdzeniu transakcji.
Powtórki po utracie ACK nie podwajają statystyk. Przed utworzeniem wpisu wiadomości
aplikacja opróżnia kolejkę, a tuż przed wysyłką ponownie sprawdza blokadę odbiorcy.
Nie ma atomowej transakcji obejmującej endpoint i SMTP: rezygnacja po ostatnim
sprawdzeniu może zbiec się z wiadomością już przekazywaną dostawcy.

Otwarcia i kliknięcia są liczone raz na token; nie stanowią liczby wszystkich
wizyt. Po osiągnięciu limitu 100000 oczekujących zdarzeń śledzenie nie dodaje
kolejnych; rezygnacje są nadal zachowywane. Powtarzane żądania tego samego tokenu
nie powiększają kolejki. Pełny dysk zwraca błąd, nie fałszywe potwierdzenie rezygnacji.
ACK usuwa obsłużone zdarzenia. Mapowania, blokady i znaczniki deduplikacji pozostają
w bazie, aby stare linki działały; wymagają monitorowania miejsca i kopii zapasowych.
Limity zapytań z Internetu należy ustawić na proxy. Endpoint nie zapisuje access logu
z tokenami, adresów IP odbiorców ani User-Agent. Docelowy URL kliknięcia może zawierać
dane osobowe i pozostaje w mapowaniu; uwzględnij to w zasadach retencji instalacji.
