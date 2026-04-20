export interface HeartRateZone {
  name: string;
  minutes: number;
}

export interface FitbitEntry {
  date: string; // YYYY-MM-DD
  steps?: number;
  distance?: number;
  floors?: number;
  resting_heart_rate?: number;
  breathing_rate?: { breathingRate?: number };
  hrv?: { dailyRmssd?: number };
  sleep?: {
    sleep_duration?: number;
    minutes_asleep?: number;
    sleep_start?: string;
    sleep_end?: string;
    awakenings?: number;
  };
  wear_time_minutes?: number;
  heart_rate_zones?: HeartRateZone[];
  exercise?: { name: string; duration: number }[];
}

export interface QuestionnaireEntry {
  date: string; // ISO
  questionKey: string;
  answers: { key: string; translations?: { language: string; text: string }[] }[];
  questionTranslations: { language: string; text: string }[];
  comment?: string;
  audio_url?: string | null;
  media_urls?: string[];
  answerType?: string;
}

export type ChartRes = 'daily' | 'weekly' | 'monthly';
export type ViewMode = 'weekly' | 'monthly';
export type AdherenceEntry = {
  date: string; // YYYY-MM-DD
  scheduled: number; // occurrences scheduled that day
  completed: number; // completed logs that day
  pct: number | null; // 0..100 or null if no schedule that day
};
