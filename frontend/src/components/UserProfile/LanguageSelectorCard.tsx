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
import { SUPPORTED_LANGUAGES, LANGUAGE_FLAGS, LANGUAGE_NAMES } from '@/constants/languages';

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
            {SUPPORTED_LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                <span className="flex items-center gap-1">
                  <span className="font-bold text-lg leading-6 text-zinc-800">
                    {LANGUAGE_NAMES[l]}
                  </span>
                  <img src={LANGUAGE_FLAGS[l]} alt="" className="h-4 w-4 rounded-full" />
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Card>
  );
}
