import {useOnboarding} from '../context/OnboardingContext';
import {useNavigate} from 'react-router-dom';
import Modal from './Modal';
import {Button,Icon} from './ui';
const steps=[['mail','Połącz skrzynkę','Skonfiguruj SMTP i IMAP swojego dostawcy.','/inboxes'],['contacts','Dodaj kontakty','Zaimportuj arkusz albo utwórz kontakt i własne pola.','/leads'],['template','Przygotuj wiadomość','Utwórz szablon i sprawdź podgląd dla wybranego kontaktu.','/templates'],['campaign','Sprawdź kampanię','Ustaw limity i harmonogram. Uruchom wysyłkę dopiero po kontroli.','/campaigns']];
export default function Welcome(){
 const {showOnboarding,completeOnboarding}=useOnboarding();const navigate=useNavigate();
 if(!showOnboarding)return null;
 return <Modal title="Witaj w Sekaro" size="small" onClose={completeOnboarding}><p className="sk-muted">Twoja poczta, kontakty i kampanie w jednym prywatnym panelu.</p><div className="sk-welcome-steps">{steps.map(([icon,title,text,to])=><button key={to} onClick={()=>{completeOnboarding();navigate(to);}}><Icon name={icon} size={25}/><span><strong>{title}</strong><small>{text}</small></span><Icon name="arrow" size={17}/></button>)}</div><div className="sk-form-actions"><Button onClick={completeOnboarding} variant="primary">Przejdź do panelu</Button></div></Modal>;
}
