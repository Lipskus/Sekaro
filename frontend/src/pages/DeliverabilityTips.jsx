import { useState } from 'react';
import { Card } from '../components/ui/Card';
import {
  RiShieldCheckLine,
  RiMailSendLine,
  RiFileTextLine,
  RiAlertLine,
  RiCheckLine,
  RiArrowDownSLine,
} from 'react-icons/ri';

const sections = [
  {
    id: 'setup',
    label: 'Przed wysyłką',
    icon: RiShieldCheckLine,
    rules: [
      {
        title: 'Skonfiguruj uwierzytelnianie domeny nadawczej',
        body: 'Domena nadawcza powinna mieć poprawnie skonfigurowane rekordy uwierzytelniające. SPF i DKIM są podstawą, a DMARC pozwala określić politykę dla wiadomości, które nie przejdą weryfikacji.',
        tag: 'Required',
      },
      {
        title: 'Używaj osobnej domeny do cold outreach',
        body: 'Nie wysyłaj cold mailingu z głównej domeny firmy. Użyj osobnej domeny lub subdomeny przeznaczonej do outreachu, aby problemy z odbiciami lub skargami nie wpływały bezpośrednio na reputację głównej domeny.',
        tag: 'Required',
      },
      {
        title: 'Rozgrzewaj nowe skrzynki przed kampaniami',
        body: 'Nowa skrzynka nie powinna od razu wysyłać dużego wolumenu. Zwiększaj liczbę wiadomości stopniowo i obserwuj reputację nadawcy. Zbyt szybki start jest częstą przyczyną trafiania do spamu.',
        tag: 'Required',
      },
      {
        title: 'Weryfikuj listę kontaktów',
        body: 'Przed uruchomieniem kampanii zweryfikuj adresy. W Ustawieniach → Funkcje → Weryfikacja e-mail możesz podłączyć obsługiwany serwis lub własnego dostawcę. Po włączeniu weryfikacji nowe kontakty dodawane do kampanii mogą być sprawdzane automatycznie.',
        tag: 'Recommended',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Treść wiadomości',
    icon: RiFileTextLine,
    rules: [
      {
        title: 'Zwykły tekst czy HTML',
        body: 'Jeśli nie śledzisz otwarć ani kliknięć, zwykły tekst jest najprostszą opcją i wygląda naturalnie. Śledzenie otwarć lub kliknięć wymaga HTML. Przy małym wolumenie często wystarczy mierzyć odpowiedzi i porównywać ich odsetek między kampaniami.',
        tag: null,
      },
      {
        title: 'Przy śledzeniu zostaw pierwszą wiadomość prostą',
        body: 'Jeśli korzystasz ze śledzenia, rozważ wysłanie pierwszej wiadomości w sekwencji jako zwykłego tekstu bez trackingu. Kolejne wiadomości mogą używać HTML. Pierwsza wiadomość rozpoczyna wątek i ma największe znaczenie dla dostarczenia do skrzynki odbiorczej.',
        tag: 'Tip',
      },
      {
        title: 'Pisz naturalnie i konkretnie',
        body: 'Używaj krótkich zdań, szybko przechodź do sedna i unikaj zbędnego formalnego języka. Wiadomość powinna brzmieć jak rozmowa z konkretną osobą, a nie jak masowa wysyłka.',
        tag: null,
      },
      {
        title: 'Personalizuj więcej niż samo imię',
        body: 'Najlepsza personalizacja odnosi się do czegoś konkretnego: firmy odbiorcy, opublikowanej treści, sytuacji w branży lub problemu, który rzeczywiście może go dotyczyć. Im bardziej wiadomość pasuje do odbiorcy, tym większa szansa na odpowiedź.',
        tag: null,
      },
      {
        title: 'Jedno wezwanie do działania na wiadomość',
        body: 'Zakończ wiadomość jednym prostym pytaniem lub działaniem. Jednoczesna prośba o rozmowę, wejście na stronę i odpowiedź na kilka pytań zmniejsza czytelność przekazu.',
        tag: null,
      },
      {
        title: 'Unikaj załączników w cold mailach',
        body: 'Załączniki mogą zwiększać ryzyko filtrowania wiadomości. Jeśli musisz udostępnić materiał, bezpieczniej jest podać odpowiedni link i ograniczyć liczbę elementów w wiadomości.',
        tag: null,
      },
    ],
  },
  {
    id: 'sending',
    label: 'Sposób wysyłki',
    icon: RiMailSendLine,
    rules: [
      {
        title: 'Wysyłaj w godzinach pracy odbiorcy',
        body: 'Dopasuj okno wysyłki do strefy czasowej odbiorców. Wiadomość wysłana wtedy, gdy odbiorca pracuje, ma większą szansę zostać zauważona w odpowiednim momencie.',
        tag: null,
      },
      {
        title: 'Utrzymuj umiarkowany limit dzienny skrzynki',
        body: 'Dla cold outreachu lepiej rozkładać wolumen na kilka skrzynek niż mocno obciążać jedną. W Sekaro jako ostrożny punkt odniesienia przyjmujemy do 50 wiadomości dziennie na rozgrzaną skrzynkę.',
        tag: null,
      },
      {
        title: 'Rozkładaj wysyłkę w czasie',
        body: 'Nie wysyłaj całej listy w krótkim oknie. Rozłóż wiadomości w ciągu dnia i stosuj losowe opóźnienia. Bardzo regularne, gwałtowne skoki wolumenu przypominają automatyczną wysyłkę masową.',
        tag: null,
      },
      {
        title: 'Nie rozciągaj niepotrzebnie sekwencji',
        body: 'Kolejne follow-upy zwiększają liczbę kontaktów z odbiorcą, ale zbyt długa sekwencja może podnosić liczbę skarg i wypisań. Zacznij od 2–3 wiadomości i oceniaj wyniki.',
        tag: null,
      },
    ],
  },
  {
    id: 'reputation',
    label: 'Ochrona reputacji',
    icon: RiAlertLine,
    rules: [
      {
        title: 'Reaguj na odbite adresy',
        body: 'Adres, który trwale odbija wiadomości, nie powinien pozostawać w aktywnej wysyłce. Monitoruj odsetek odbić i korzystaj z weryfikacji adresów, aby ograniczać wysyłkę do nieistniejących lub niedostępnych skrzynek.',
        tag: 'Critical',
      },
      {
        title: 'Respektuj każde wypisanie',
        body: 'Jeżeli odbiorca prosi o zaprzestanie kontaktu lub korzysta z mechanizmu wypisania, dodaj go do globalnej listy wykluczeń. Sekaro blokuje kolejne wysyłki do wykluczonych adresów; pamiętaj też o wymaganiach prawnych właściwych dla odbiorcy i Twojej organizacji.',
        tag: 'Critical',
      },
      {
        title: 'Traktuj odpowiedzi jako ważniejszy sygnał niż otwarcia',
        body: 'Odpowiedź jest bezpośrednim sygnałem zaangażowania. Pomiar otwarć jest mniej wiarygodny, ponieważ część klientów pocztowych ładuje elementy wiadomości automatycznie. Oceniaj kampanię przede wszystkim na podstawie odpowiedzi i jakości rozmów.',
        tag: null,
      },
    ],
  },
];

const tagStyles = {
  Required:    'bg-red-100 text-red-700 border border-red-200',
  Critical:    'bg-red-100 text-red-700 border border-red-200',
  Recommended: 'bg-amber-100 text-amber-700 border border-amber-200',
  Tip:         'bg-teal-100 text-teal-700 border border-teal-200',
};

const tagLabels = {
  Required: 'Wymagane',
  Critical: 'Krytyczne',
  Recommended: 'Zalecane',
  Tip: 'Wskazówka',
};

const metrics = [
  { label: 'Odsetek odbić',             safe: 'Poniżej 2%',   danger: 'Powyżej 3%' },
  { label: 'Skargi na spam',             safe: 'Poniżej 0,1%', danger: 'Powyżej 0,3%' },
  { label: 'Wiadomości / skrzynkę / dzień', safe: 'Do 50',    danger: 'Powyżej 50' },
  { label: 'Follow-upy w sekwencji',     safe: '2–3 wiadomości', danger: '4+ wiadomości' },
  { label: 'Okres rozgrzewania',         safe: '2–4 tygodnie', danger: 'Brak rozgrzewania' },
];

function Tag({ label }) {
  const cls = tagStyles[label];
  if (!cls) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${cls}`}>
      {tagLabels[label] || label}
    </span>
  );
}

function Rule({ rule, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); } }}
      onClick={() => setOpen(v => !v)}
      className={`rounded-lg border shadow-sm cursor-pointer transition-colors duration-150 ${
        open
          ? 'bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800'
      }`}
    >
      {/* Header row — never compresses */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-xs font-semibold text-gray-300 dark:text-gray-600 w-6 flex-shrink-0 text-right tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{rule.title}</span>
          {rule.tag && <Tag label={rule.tag} />}
        </div>
        <span className={`text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}>
          <RiArrowDownSLine size={18} />
        </span>
      </div>

      {/* Animated body — grid trick for smooth height transition */}
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="px-5 py-4 pl-14 text-sm text-gray-600 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-700">
            {rule.body}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DeliverabilityTips() {
  const [activeSection, setActiveSection] = useState('setup');
  const section = sections.find(s => s.id === activeSection);

  const sectionOffsets = {};
  let globalIndex = 0;
  sections.forEach(s => {
    sectionOffsets[s.id] = globalIndex;
    globalIndex += s.rules.length;
  });

  return (
    <div className="sk-deliverability mx-auto min-h-0 max-w-5xl flex-1 space-y-8 overflow-y-auto p-8">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-1">Dostarczalność</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Praktyczne zasady pomagające poprawić dostarczalność i chronić reputację nadawcy.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map(s => {
          const Icon = s.icon;
          const active = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors duration-150 ${
                active
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
            >
              <Icon size={15} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Rules list */}
      <div className="space-y-2">
        {section.rules.map((rule, i) => (
          <Rule key={rule.title} rule={rule} index={sectionOffsets[activeSection] + i} />
        ))}
      </div>

      {/* Quick reference table */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">Szybka ściąga</h2>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
            {['Wskaźnik', 'Bezpieczna strefa', 'Strefa ryzyka'].map(h => (
              <span key={h} className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`grid grid-cols-3 px-4 py-3 text-sm ${
                i < metrics.length - 1 ? 'border-b border-gray-100' : ''
              } ${i % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-800/60' : 'bg-white dark:bg-gray-900'}`}
            >
              <span className="text-gray-600 dark:text-gray-300 font-medium">{m.label}</span>
              <span className="flex items-center gap-1 text-teal-600 font-medium">
                <RiCheckLine size={14} className="flex-shrink-0" />{m.safe}
              </span>
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <RiAlertLine size={14} className="flex-shrink-0" />{m.danger}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
