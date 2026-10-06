# Etap 3 — analityka outreach

Jeden pakiet według `RELEASE_EXECUTION_PLAN.md`. Baza: odebrany etap 2 (`2b9b506`). Bez migracji, zmian CRM i automatycznego uruchamiania wysyłki.

## Raport odbiorców

`GET /api/analytics/report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&group_by=campaign|inbox|field`

Opcjonalne powtarzane `campaign_id`; dla `field` wymagane `field_key`. Kraj i region są zwykłymi polami kontaktu, wybieranymi z istniejących definicji lub danych. Nie zakładamy nazw ani nie dopisujemy pól branżowych.

- Okres obejmuje pełne dni UTC, od początku pierwszego dnia do końca ostatniego. Maksymalnie 366 dni, błędny lub odwrócony zakres daje HTTP 400.
- Kohorta: wiadomości `EmailLog.sent_at` w tym okresie. `sent` to liczba wiadomości, a `recipients` to unikalne pary **kontakt–kampania** w grupie. Powtórna wysyłka do tego samego kontaktu w kampanii nie zwiększa tego mianownika.
- `replied` to liczba par z co najmniej jedną odpowiedzią przypisaną do wiadomości z kohorty, do końca wybranego okresu. `reply_rate = replied / recipients × 100` (0–100%). Odpowiedź przed wysyłką ani odpowiedź na starszą wysyłkę nie zwiększa wyniku kohorty.
- `LeadReply` nie zawiera skrzynki ani identyfikatora wiadomości. Stosujemy jawną heurystykę: ostatnia poprzedzająca wysyłka w tej samej parze kontakt–kampania; przy równym czasie decyduje najwyższe ID. To nie jest potwierdzona atrybucja wątku. W przekroju skrzynek odpowiedź otrzymuje tylko tak wybrana skrzynka.
- Powtórne znaczniki odpowiedzi nie zwiększają liczby odpowiadających. Kategorie `auto_reply` i `out_of_office` wykluczamy według **bieżącej** klasyfikacji przypisania. NULL ani usunięte przypisanie nie wykluczają zapisanej odpowiedzi. Przy historycznych duplikatach przypisania obowiązuje najwyższe ID.
- `bounced` i `unsubscribed` oznaczają **bieżący stan przypisania** wśród odbiorców kohorty. Nie są zdarzeniami w wybranym okresie: baza nie ma dat ich zmiany. Procenty używają tego samego mianownika, ale są NULL, jeżeli choć jeden odbiorca nie ma znanego stanu. `status_known` ujawnia pokrycie. Globalna lista blokad nie jest automatycznie traktowana jako wypisanie.
- Segmenty według pól kontaktu także używają bieżących wartości. Brak wartości ma osobny klucz, niezależny od literalnej nazwy wpisanej przez użytkownika. Tego samego kontaktu można znaleźć w kilku grupach; nie należy sumować grup w celu uzyskania globalnej liczby osób.
- Brak wysyłek daje pustą listę i komunikat, nie pozornie pozytywny procent. Błąd pobierania usuwa widok poprzednich wyników i blokuje eksport.
- CSV eksportuje ten sam przekrój i zakres. NULL to „—”, teksty są cytowane, a potencjalne formuły arkusza neutralizowane.

## Istniejące raporty

Raport dzienny pozostaje osią aktywności, nie kohortą. Odpowiedzi: jeden kontakt w kampanii dziennie; dni mogą zawierać odpowiedzi na wcześniejsze wysyłki. Iloraz odpowiedzi i wysyłek w okresie jest nazwany właśnie tak i może przekroczyć 100%. Otwarcia i kliknięcia to zdarzenia trackingowe, a unikalne IP są liczone osobno na dzień i kampanię — nie są liczbą osób ani dowodem dostarczenia.

W analityce kroków odpowiedź zwiększa wynik tylko ostatniej poprzedzającej wiadomości, raz na wiadomość. Nie przypisujemy każdej późniejszej odpowiedzi do wszystkich kroków. „Szanse” nadal oznaczają wysyłki do kontaktów obecnie zainteresowanych; interfejs wyraźnie zaznacza, że nie są historycznymi konwersjami.

## Diagnostyka

`GET /api/diagnostics/mailboxes`: jawna projekcja dozwolonych pól, bez haseł i surowych błędów transportu. Pokazuje zapisany wynik testu SMTP (IMAP, jeśli skonfigurowany), czas testu/synchronizacji, limity, pauzę i retencję EML. Brak daty testu to brak pomiaru, nawet przy starym `last_test_ok=true`. Zmiana parametrów połączenia od tej wersji unieważnia wynik; zapis bez zmiany zachowuje wynik. To nie jest nowa historia rewizji konfiguracji ani test na żywo.

`POST /api/diagnostics/domains/{domain}` z JSON `selector` i `sending_ipv4` (oba opcjonalne) działa tylko dla domen skonfigurowanych skrzynek i po uwierzytelnieniu:

- SPF: obecność pojedynczego rekordu TXT `v=spf1`; bez pełnej ewaluacji mechanizmów, includes i autoryzacji nadawcy.
- DKIM: jawny selektor. Obecność rekordu klucza, rozpoznanie pustego/odwołanego klucza; bez weryfikacji podpisu wiadomości. Brak selektora = brak pomiaru.
- DMARC: rekord dokładnie `_dmarc.<domena>`, bez wyszukiwania dziedziczonej polityki i sprawdzania alignment. Brak rekordu w tym miejscu nie przesądza o braku polityki nadrzędnej.
- MX: rekordy DNS, osobne oznaczenie Null MX. Brak MX nie jest stwierdzeniem braku implicit MX/fallback do A/AAAA.
- Lista blokad: wyłącznie Spamhaus ZEN dla podanego publicznego IPv4 rzeczywistego serwera wysyłającego. Nie zgadujemy IP ze skrzynki, MX ani nazwy serwera SMTP. Kontrolne zapytanie o znany wpis poprzedza pomiar; blokada resolvera, błędny kod i timeout są błędem, nigdy „brakiem wpisu”. Brak IP = brak pomiaru. Operator musi stosować warunki dostawcy dla publicznych mirrorów; nie obchodzimy ograniczeń usługi.
- Wyniki pokazują źródło/rekordy i czas. Zmiana selektora/IP czyści poprzedni wynik. Wynik nie jest zapisywany jako historia ani używany do automatycznej zmiany kampanii.
- Preflight odsyła do domen i jawnie informuje, że gotowość kampanii nie obejmuje pomiaru DNS. Brak pomiaru nie staje się zielonym wynikiem.
- Demo blokuje zewnętrzną diagnostykę w middleware i endpointzie. Stan skrzynek demo jest wyraźnie oznaczony jako fikcyjny.

Dokumentacja źródłowa: [Spamhaus — kody odpowiedzi](https://www.spamhaus.org/resource-hub/dnsbl/spamhaus-dnsbl-return-codes-technical-update/), [Spamhaus — zastosowanie DNSBL](https://www.spamhaus.org/faqs/dnsbl-usage/). Obecność rekordów nie jest certyfikacją zgodności protokołów.

Pełna ocena reputacji, historyczne konwersje bez źródłowych dat i skuteczność spotkań nie są w tym pakiecie. Nie tworzymy tych pomiarów z zastępczych wskaźników.
