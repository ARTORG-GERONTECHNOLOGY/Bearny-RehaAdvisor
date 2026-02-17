import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

type Translation = { language: string; text: string };
type PossibleAnswer = { key: string; translations: Translation[] };

export type NormalizedQuestion = {
  questionKey: string;
  label: string;
  options: PossibleAnswer[];
  type: 'dropdown' | 'multi-select' | 'text' | 'video';
};

const pickLabel = (translations: Translation[] = [], lang: string, fallback = '') => {
  const base = (lang || 'en').slice(0, 2);
  return (
    translations.find((t) => t.language === base)?.text ||
    translations.find((t) => t.language?.split('-')?.[0] === base)?.text ||
    translations.find((t) => t.language === 'en')?.text ||
    translations[0]?.text ||
    fallback
  );
};

class PatientQuestionnairesStore {
  // Initial questionnaire popup
  showInitialPopup = false;

  // Health questionnaire popup
  healthQuestions: NormalizedQuestion[] = [];
  showHealthPopup = false;

  // Intervention feedback popup
  feedbackQuestions: NormalizedQuestion[] = [];
  showFeedbackPopup = false;
  feedbackInterventionId: string | null = null;
  feedbackDateKey: string = '';

  constructor() {
    makeAutoObservable(this);
  }

  closeInitial() {
    this.showInitialPopup = false;
  }

  closeHealth() {
    this.showHealthPopup = false;
  }

  closeFeedback() {
    this.showFeedbackPopup = false;
    this.feedbackQuestions = [];
    this.feedbackInterventionId = null;
    this.feedbackDateKey = '';
  }

  async checkInitialQuestionnaire(patientId: string) {
    try {
      const { data: res } = await apiClient.get(`users/${patientId}/initial-questionaire/`);
      runInAction(() => {
        this.showInitialPopup = !!res?.data;
      });
    } catch {
      // silent
    }
  }

  async loadHealthQuestionnaire(patientId: string, uiLang: string) {
    try {
      const { data: res } = await apiClient.get(
        `/patients/get-questions/Healthstatus/${patientId}/`
      );
      if (!res?.questions?.length) return;

      const lang = (uiLang || 'en').slice(0, 2);
      const formatted: NormalizedQuestion[] = (res.questions || []).map((q: any) => ({
        questionKey: q.questionKey,
        label: pickLabel(q.translations, lang, q.questionKey),
        options: q.possibleAnswers || [],
        type: q.answerType,
      }));

      runInAction(() => {
        this.healthQuestions = formatted;
        this.showHealthPopup = true;
      });
    } catch {
      // silent
    }
  }

  async openInterventionFeedback(
    patientId: string,
    interventionId: string,
    dateKey: string,
    uiLang: string
  ) {
    const { data: res } = await apiClient.get(
      `/patients/get-questions/Intervention/${patientId}/${interventionId}/`
    );
    const lang = (uiLang || 'en').slice(0, 2);

    const formatted: NormalizedQuestion[] = (res.questions || []).map((q: any) => ({
      questionKey: q.questionKey,
      label: pickLabel(q.translations, lang, q.questionKey),
      options: q.possibleAnswers || [],
      type: q.answerType,
    }));

    runInAction(() => {
      this.feedbackInterventionId = interventionId;
      this.feedbackDateKey = dateKey;
      this.feedbackQuestions = formatted;
      this.showFeedbackPopup = true;
    });
  }
}

export const patientQuestionnairesStore = new PatientQuestionnairesStore();
