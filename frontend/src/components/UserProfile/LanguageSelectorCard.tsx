import { useTranslation } from 'react-i18next';
import Card from '@/components/Card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';

const languages = ['de', 'fr', 'en', 'it', 'pt', 'nl'] as const;

const flagMap: Record<string, string> = {
  en: flagEn,
  de: flagDe,
  fr: flagFr,
  it: flagIt,
  pt: flagPt,
  nl: flagNl,
};

const languageNames: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
};

export default function LanguageSelectorCard() {
  const { t, i18n } = useTranslation();

  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  return (
    <Card className="flex flex-col gap-1">
      <div className="text-sm font-medium text-zinc-500">{t('Language')}</div>
      <Select onValueChange={handleChange} value={lang}>
        <SelectTrigger className="bg-white border-white shadow-none p-0">
          <SelectValue placeholder={t('Select language')} />
        </SelectTrigger>
        <SelectContent className="bg-zinc-50 rounded-3xl p-1">
          <SelectGroup>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>
                <span className="font-bold text-lg leading-6 text-zinc-800">
                  {languageNames[l]}
                </span>
                <img src={flagMap[l]} className="h-4 w-4 rounded-full ml-1 -mt-1" />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Card>
  );
}
