# Etap 9 — adaptery poczty i Gmail API

Sekaro korzysta ze wspólnej granicy adapterów dla wysyłki i synchronizacji SMTP/IMAP oraz Gmail. Nieznany typ skrzynki jest odrzucany także w trybie testowym. Istniejący kod Microsoft 365 zachowano dla zgodności; jego konfiguracja i odbiór należą do etapu 10.

## Połączenie Gmail / Google Workspace

Połączenie skrzynki nie jest logowaniem użytkownika do Sekaro. Operację wykonuje zalogowany administrator w **Skrzynki → Gmail API**. Sekaro wykorzystuje istniejący silnik synchronizacji i wysyłki; nowa skrzynka ma wstrzymaną wysyłkę. Ponowne połączenie zachowuje ID, historię, limity i stan wstrzymania oraz wymaga wybrania tego samego konta Google.

1. W Google Cloud wybierz projekt, włącz **Gmail API**, skonfiguruj ekran zgody i utwórz klienta OAuth typu **Web application**. Dla aplikacji w trybie testowym dodaj właściwe konta testowe. Zasady weryfikacji i dostępności zakresów zależą od sposobu publikacji aplikacji oraz polityki organizacji Google Workspace.
2. Zarejestruj dokładny URI przekierowania: `https://TWOJA-DOMENA/api/gmail/callback`. To prywatna trasa aplikacji — pozostaje za istniejącą ochroną dostępu, np. Cloudflare Access. Nie publikuj starej trasy `/oauth/google/callback` ani publicznych linków do łączenia kont.
3. W środowisku kontenera aplikacji ustaw:

   ```dotenv
   BASE_URL=https://TWOJA-DOMENA
   GOOGLE_CLIENT_ID=wartosc-z-google-cloud
   GOOGLE_CLIENT_SECRET=sekret-z-google-cloud
   SEKARO_ENCRYPTION_KEY=staly-klucz-instalacji
   ```

   Nie zastępuj istniejącego klucza szyfrowania. Przechowuj go oddzielnie razem z bezpieczną kopią konfiguracji; jest potrzebny po odtworzeniu bazy. Sekrety nie trafiają do repozytorium ani formularza przeglądarki. `.env.example` zawiera nazwy ustawień. Zmiana środowiska wymaga odtworzenia kontenera przez używaną ścieżkę instalacji; zwykły restart procesu nie zmienia środowiska już utworzonego kontenera.
4. Zaloguj się do Sekaro jako administrator, otwórz Skrzynki i wybierz **Połącz Gmail**. Wyraź zgodę w Google. Wrócisz do listy skrzynek; nie jest wysyłana wiadomość testowa.
5. Sprawdź skrzynkę i synchronizację w istniejącym widoku poczty. Wznów wysyłkę dopiero po ustawieniu limitów i świadomej kontroli kampanii. Połączenie samo nie przypisuje skrzynki do kampanii.

Zakres `gmail.modify` obsługuje odczyt, wysyłkę i oznaczenia wiadomości bez uprawnienia do trwałego usuwania całej poczty. Dostęp offline zapewnia token odświeżania. Brak wymaganego zakresu lub tokenu odświeżania przerywa połączenie. Nie rozszerzamy na Gmail zasad usuwania oryginałów SMTP/IMAP.

## Bezpieczeństwo i aktualizacja

- Wszystkie nowe trasy `/api/gmail/*`, w tym callback, wymagają aktualnej sesji administratora. Po wygaśnięciu sesji zaloguj się ponownie i rozpocznij łączenie od nowa.
- Losowy stan OAuth ważny przez 10 minut jest związany z administratorem, skrzynką i adresem instalacji. Konfiguracja pozostaje po stronie serwera. Stan jest atomowo zużywany przed wymianą kodu; błędu nie naprawia ponowne odświeżenie callbacku.
- Tokeny są szyfrowane istniejącym mechanizmem Sekaro. Przy skonfigurowanym kluczu start aplikacji szyfruje również stare jawne tokeny Gmail; migracja jest idempotentna i zachowuje dane. Bez klucza nowe połączenia są blokowane, a stare dane nie są automatycznie kasowane ani zmieniane.
- Istniejąca skrzynka SMTP nigdy nie jest niejawnie konwertowana na Gmail. Duplikat adresu wymaga rozstrzygnięcia przez administratora; nie usuwaj skrzynki tylko po to, by obejść ten komunikat.
- Audyt administratorów zapisuje autora, operację i ID/adres skrzynki, bez tokenów. API stanu pokazuje konfigurację, konta, zakresy, czas ważności tokenu oraz ostatnią synchronizację, bez ujawniania poświadczeń.
- Demo blokuje połączenia Google, synchronizację i rzeczywistą wysyłkę. Panel informuje o blokadzie.
- SMTP/IMAP, polityki `keep / immediate / days` i istniejący eksport EML pozostają dostępne na dotychczasowej ścieżce. Gmail używa własnego lustra wątków; ten etap nie dodaje eksportu pełnego EML dla Gmaila.

## Diagnostyka

| Objaw | Działanie |
|---|---|
| Przycisk połączenia nieaktywny | Sprawdź tryb demo, uprawnienia administratora, HTTPS `BASE_URL`, oba ustawienia Google i klucz szyfrowania |
| Google zgłasza `redirect_uri_mismatch` | Porównaj dokładnie zarejestrowany adres z `/api/gmail/status` — protokół, domenę i ścieżkę |
| Odmowa zgody lub niekompletny zakres | Rozpocznij ponownie i udziel dostępu Gmail; sprawdź konto testowe i politykę Workspace |
| Sesja wygasła / stan użyty | Wróć do Sekaro, zaloguj się i wybierz Połącz Gmail ponownie |
| Wybrano inne konto przy ponownym połączeniu | Powtórz operację z adresem istniejącej skrzynki |
| Cofnięto zgodę / token odświeżania przestał działać | Wstrzymaj skrzynkę i użyj Połącz ponownie; nie usuwaj historii |
| Chcesz odebrać dostęp aplikacji | Wstrzymaj skrzynkę w Sekaro i cofnij zgodę w ustawieniach konta Google; nie ma nowego przycisku zdalnego cofania zgody w tym etapie |

## Odbiór i ograniczenia

Testy używają mockowanego Google i bazy SQLite. Obejmują granice uprawnień, stan OAuth i replay, szyfrowanie/migrację, reconnect, ochronę SMTP przed konwersją, dispatch adapterów, wysyłkę Gmail, synchronizację istniejącego lustra, archiwum SMTP i blokady demo. Testy UI sprawdzają brak wywołań konfiguracji dla zwykłego użytkownika, blokady demo/konfiguracji oraz błędy reconnect. Pełne wyniki bieżącego pakietu są w planie wydań.

Pozostaje odbiór na prawdziwym kliencie Google: zgoda, odnowienie tokenu i synchronizacja wskazanego konta. Nie wykonano rzeczywistej wysyłki ani testu współbieżności na PostgreSQL. Blokada/advisory lock i warunkowa aktualizacja migracji są zaimplementowane; test SQLite nie zastępuje kontroli środowiska produkcyjnego.

Źródła: [Google OAuth dla aplikacji webowych](https://developers.google.com/identity/protocols/oauth2/web-server), [zakresy Gmail API](https://developers.google.com/workspace/gmail/api/auth/scopes).
