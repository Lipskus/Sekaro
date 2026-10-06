# Etap 10 — Microsoft 365, stopki i S/MIME

Trzy funkcje w jednym pakiecie. Połączenie Microsoft jest oddzielne od logowania do Sekaro. Stopka i S/MIME są niezależne, opcjonalne i domyślnie wyłączone dla każdej skrzynki. Bez certyfikatu można normalnie korzystać z dotychczasowej poczty.

## Microsoft 365 / Outlook

1. W Microsoft Entra zarejestruj aplikację z platformą **Web** i adresem przekierowania `https://TWOJA-DOMENA/api/office365/callback`. Wybierz obsługiwane konta zgodne z docelową organizacją; skonfiguruj sekret klienta.
2. Używane uprawnienia delegowane Microsoft Graph to `Mail.ReadWrite`, `Mail.Send`, `User.Read`, wraz z dostępem offline. Organizacja może wymagać zgody administratora. Nie jest używany dostęp aplikacyjny do wszystkich skrzynek tenanta.
3. Ustaw środowisko kontenera aplikacji:

   ```dotenv
   BASE_URL=https://TWOJA-DOMENA
   OFFICE365_CLIENT_ID=id-aplikacji
   OFFICE365_CLIENT_SECRET=sekret-aplikacji
   OFFICE365_TENANT_ID=id-tenanta
   SEKARO_ENCRYPTION_KEY=istniejacy-staly-klucz-instalacji
   ```

   Dla aplikacji obsługującej wiele organizacji/konta osobiste można użyć `common`, jeżeli konfiguracja rejestracji aplikacji na to pozwala. Nie zastępuj istniejącego klucza szyfrowania. Zmiana środowiska wymaga odtworzenia kontenera przez ścieżkę instalacji; sam restart nie aktualizuje jego środowiska.
4. Jako administrator Sekaro otwórz **Skrzynki → Microsoft 365 → Połącz Microsoft 365**. Wybierz konto, udziel zgody i wróć do panelu.
5. Nowa skrzynka ma wstrzymaną wysyłkę. Ustaw limity i sprawdź przypisania przed wznowieniem. Reconnect wymaga tego samego konta; zachowuje historię, limity i stan wstrzymania. Istniejący SMTP/Gmail nie jest konwertowany.

Callback pozostaje za prywatną bramą dostępu, np. Cloudflare Access. Nie otwieraj starego `/oauth/office365/callback`. Wszystkie nowe trasy połączenia wymagają zalogowanego administratora. Stan jednorazowy wygasa po 10 minutach, jest związany z administratorem i konfiguracją instalacji; przepływ używa PKCE S256. Po wygaśnięciu sesji zaloguj się i rozpocznij operację ponownie.

Tokeny są szyfrowane. Migracja startowa przy skonfigurowanym kluczu szyfruje również stare tokeny Microsoft, tak jak Gmail. Brak klucza blokuje nowe połączenia. Status API nie ujawnia tokenów; pokazuje konta, zakresy, ważność tokenu i ostatnią synchronizację.

Synchronizacja wykorzystuje istniejące lustro Microsoft Graph, foldery Inbox/SentItems/JunkEmail oraz checkpointy delta. W tym pakiecie checkpointy i wiadomości zatwierdzane są razem, aby awaria w połowie pobierania nie pomijała reszty wiadomości. Odpowiedź używa `createReply` z kompletnym MIME, następnie wysłania szkicu — bez niedokumentowanego nadpisywania `/$value`.

## Opcjonalna stopka

W edycji skrzynki otwórz **Stopka i S/MIME**. Wpisz wersję tekstową oraz, opcjonalnie, wersję z formatowaniem. Edytor obsługuje podstawowe formatowanie i linki, bez osadzania aktywnej treści i obrazów. Włącz **Automatycznie dodawaj stopkę** i zapisz.

Stopka jest dodawana we wspólnym składaniu MIME: kampanie, odpowiedzi i testy. Nie edytuje zapisanych szablonów i nie zastępuje linku rezygnacji. Podgląd harmonogramu używa przypisanej skrzynki; podgląd kampanii pokazuje stopkę pierwszej przypisanej skrzynki wraz z jej adresem (tej samej, której używa test kampanii). Przy wielu skrzynkach stopki mogą się różnić. Odpowiedź w skrzynce ma rozwijany podgląd treści ze stopką. Zmiany zapisane w konfiguracji po obejrzeniu podglądu obowiązują przy późniejszej wysyłce.

## Opcjonalny podpis cyfrowy S/MIME

1. Przygotuj osobisty certyfikat S/MIME z kluczem prywatnym w P12/PFX i jego hasło. Nie przesyłaj klucza w rozmowie ani nie umieszczaj go w repozytorium.
2. W **Stopka i S/MIME** wybierz plik (maks. 250 KB) i podaj hasło. Import wymaga skonfigurowanego szyfrowania na serwerze.
3. Certyfikat musi zawierać adres nadawcy, mieć poprawny okres ważności, uprawnienie email protection i klucz RSA 2048+ lub EC 256+. Certyfikat CA nie jest akceptowany jako certyfikat osobisty.
4. Włącz **Podpisuj wiadomości certyfikatem S/MIME**, zapisz i sprawdź wiadomość w docelowym kliencie pocztowym. Można przechowywać certyfikat przy wyłączonym podpisywaniu.
5. Aby usunąć certyfikat, wyłącz podpisywanie i zaznacz usunięcie przy zapisie. Samo wyłączenie stopki nie wyłącza S/MIME i odwrotnie.

P12/PFX i hasło są szyfrowane w bazie, a API nigdy nie zwraca ich do przeglądarki. Audyt zapisuje ustawienia przełączników i fakt wymiany/usunięcia certyfikatu, bez kluczy i haseł. Zachowaj klucz szyfrowania instalacji do odtworzenia kopii bazy.

Podpis obejmuje końcową strukturę MIME treści i załączników po przygotowaniu wiadomości, stopki i trackingu. Zewnętrzne nagłówki transportowe nie są objęte podpisem S/MIME. Nie jest to szyfrowanie wiadomości do odbiorcy. Włączone S/MIME z brakującym, wygasłym, niedopasowanym lub nieczytelnym certyfikatem blokuje wysyłkę; nie ma cichego przejścia na wiadomość niepodpisaną.

Kontrola importu sprawdza lokalnie adres, klucz, daty i użycie certyfikatu. Nie potwierdza zaufania wystawcy w komputerze odbiorcy ani statusu CRL/OCSP. Za dostarczenie certyfikatu od zaufanego wystawcy i jego wymianę odpowiada administrator. Odbiorca weryfikuje podpis swoim klientem. Serwerowe dopiski lub inne modyfikacje treści po opuszczeniu Sekaro mogą naruszyć podpis. S/MIME nie gwarantuje ominięcia spamu; SPF/DKIM/DMARC pozostają osobną konfiguracją domeny.

## Testy i odbiór

Końcowy pełny zestaw: **609 testów backendu zaliczonych, 9 pominiętych; 272 testy frontendu zaliczone**. Po korekcie nagłówka prywatności callbacków dodatkowe 15/15 testów OAuth zaliczone. Build poprawny; pozostaje dotychczasowe ostrzeżenie o dużym bundlu.

S/MIME sprawdzono niezależnie przez `openssl smime -verify`: tekst, HTML, końcowe MIME Gmail/Microsoft oraz wykrywanie zmiany treści. Certyfikaty testowe są syntetyczne; `-noverify` w testach izoluje integralność podpisu od zaufania wystawcy. Testy integracji używają SQLite i mocków zewnętrznych serwerów. Nie wysyłano rzeczywistych wiadomości ani nie używano prywatnego certyfikatu użytkownika.

Do odbioru na docelowym koncie pozostają: zgoda Entra, odnowienie tokenu, rzeczywista synchronizacja oraz weryfikacja podpisu po przejściu przez dostawcę poczty w kliencie odbiorcy. Demo nadal blokuje realną wysyłkę i połączenia OAuth. Test SQLite nie zastępuje próby współbieżności PostgreSQL.

Źródła: [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [createReply MIME](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0), [sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [cryptography PKCS7](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/serialization/).
