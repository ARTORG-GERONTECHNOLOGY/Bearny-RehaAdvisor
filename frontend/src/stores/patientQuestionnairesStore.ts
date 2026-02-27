// src/stores/patientQuestionnairesStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

type Translation = { language: string; text: string };
type PossibleAnswer = { key: string; translations: Translation[] };

type RawQuestion = {
  questionKey?: unknown;
  answerType?: unknown; // backend uses answerType
  answer_type?: unknown; // sometimes backend uses answer_type
  translations?: unknown;
  possibleAnswers?: unknown;
};

export type NormalizedQuestion = {
  questionKey: string;
  answerType: 'dropdown' | 'multi-select' | 'text' | 'video';
  translations: Translation[];
  possibleAnswers: PossibleAnswer[];
};

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const asTranslations = (v: unknown): Translation[] => {
  const arr = asArray<any>(v);
  return arr
    .map((x) => ({
      language: typeof x?.language === 'string' ? x.language : 'en',
      text: typeof x?.text === 'string' ? x.text : '',
    }))
    .filter((t) => t.text);
};

const asPossibleAnswers = (v: unknown): PossibleAnswer[] => {
  const arr = asArray<any>(v);
  return arr
    .map((x) => ({
      key: typeof x?.key === 'string' ? x.key : String(x?.key ?? ''),
      translations: asTranslations(x?.translations),
    }))
    .filter((o) => o.key);
};

const normalizeAnswerType = (raw: unknown): NormalizedQuestion['answerType'] => {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (s === 'select' || s === 'dropdown') return 'dropdown';
  if (s === 'multi-select' || s === 'multiselect') return 'multi-select';
  if (s === 'video') return 'video';
  return 'text';
};

const normalizeQuestion = (q: RawQuestion): NormalizedQuestion => {
  const questionKey = typeof q?.questionKey === 'string' ? q.questionKey : '';
  const answerTypeRaw = q?.answerType ?? q?.answer_type;
  const answerType = normalizeAnswerType(answerTypeRaw);

  return {
    questionKey,
    answerType,
    translations: asTranslations(q?.translations),
    possibleAnswers: asPossibleAnswers(q?.possibleAnswers),
  };
};

export class PatientQuestionnairesStore {
  // ---- Intervention feedback modal ----
  showFeedbackPopup = false;
  feedbackInterventionId = '';
  feedbackDateKey = ''; // YYYY-MM-DD
  feedbackQuestions: NormalizedQuestion[] = [];

  // ---- Health questionnaire modal ----
  showHealthPopup = false;
  healthQuestions: NormalizedQuestion[] = [];

  // ---- Initial questionnaire modal ----
  showInitialPopup = false;

  // ---- Errors / loading ----
  loadingFeedback = false;
  feedbackError = '';

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  closeFeedback() {
    this.showFeedbackPopup = false;
    this.feedbackInterventionId = '';
    this.feedbackDateKey = '';
    this.feedbackQuestions = [];
    this.loadingFeedback = false;
    this.feedbackError = '';
  }

  closeHealth() {
    this.showHealthPopup = false;
    this.healthQuestions = [];
  }

  closeInitial() {
    this.showInitialPopup = false;
  }

  // ✅ Always end by setting showFeedbackPopup=true (even if 0 questions)
  async openInterventionFeedback(
    patientId: string,
    interventionId: string,
    dateKey: string,
    lang: string
  ) {
    runInAction(() => {
      this.loadingFeedback = true;
      this.feedbackError = '';
      this.showFeedbackPopup = false;
      this.feedbackInterventionId = interventionId || '';
      this.feedbackDateKey = dateKey || '';
      this.feedbackQuestions = [];
    });

    try {
      const res = await apiClient.get(`patients/get-questions/Intervention/${patientId}/`, {
        params: { interventionId },
        headers: lang ? { 'Accept-Language': lang } : undefined,
      });

      const data = res?.data ?? {};
      const rawQuestions = Array.isArray((data as any)?.questions)
        ? (data as any).questions
        : Array.isArray(data)
          ? data
          : [];

      const normalized = asArray<RawQuestion>(rawQuestions)
        .map(normalizeQuestion)
        .filter((q) => q.questionKey);

      runInAction(() => {
        this.feedbackQuestions = normalized;
        this.showFeedbackPopup = true;
      });
    } catch (e: any) {
      console.error('[openInterventionFeedback] failed:', e);
      runInAction(() => {
        this.feedbackError = 'Failed to load feedback questions';
        // still open: popup can show the error state
        this.showFeedbackPopup = true;
      });
    } finally {
      runInAction(() => {
        this.loadingFeedback = false;
      });
    }
  }

  async loadHealthQuestionnaire(patientId: string, lang: string) {
    try {
      const res = await apiClient.get(`patients/get-questions/Healthstatus/${patientId}/`, {
        headers: lang ? { 'Accept-Language': lang } : undefined,
      });

      const data = res?.data ?? {};
      const rawQuestions = Array.isArray((data as any)?.questions)
        ? (data as any).questions
        : Array.isArray(data)
          ? data
          : [];

      const normalized = asArray<RawQuestion>(rawQuestions)
        .map(normalizeQuestion)
        .filter((q) => q.questionKey);

      runInAction(() => {
        this.healthQuestions = normalized;
      });
    } catch {
      // ignore
    }
  }

  async checkInitialQuestionnaire(patientId: string) {
    try {
      const res = await apiClient.get(`users/${patientId}/initial-questionaire/`);
      const requires = Boolean((res?.data as any)?.requires_questionnaire);
      runInAction(() => {
        this.showInitialPopup = requires;
      });
    } catch {
      // ignore
    }
  }
}

export const patientQuestionnairesStore = new PatientQuestionnairesStore();
