export interface AnswerOption {
  key: string;
  translations: Translation[];
}
// types/InterventionType.ts
export interface InterventionTypeTh {
  _id: string;
  title: string;
  description: string;
  content_type: string;
  tags: string[];
  benefitFor: string[];
  patient_types: Array<{
    type: string;
    diagnosis: string;
    include_option: boolean;
    frequency: string;
  }>;
  media_url?: string;
  link?: string;
}
// src/types/AdminEntry.ts
export interface AdminEntry {
  id: number;
  name: string;
  email?: string;
  type: string;
  [key: string]: unknown; // optional if dynamic fields are expected
}
// src/types/index.ts or src/types/User.ts
export interface User {
  id: string;
  name: string;
  email?: string; // optional fields as needed
  [key: string]: unknown; // optionally allow other properties
}

export interface Intervention {
  _id: string;
  title: string;
  content_type: string;
  media_url?: string;
  link?: string;
  patient_types: {
    type: string;
    diagnosis: string;
    frequency: string;
    include_option: boolean;
  }[];
  benefitFor: string[];
  tags: string[];
  dates?: InterventionDate[];
}

export interface InterventionDate {
  datetime: string;
  status?: string;
  feedback?: FeedbackEntry[];
}

export interface FeedbackEntry {
  question: {
    id: string;
    translations: { language: string; text: string }[];
  };
  answer: {
    key: string;
    translations: { language: string; text: string }[];
  }[];
  comment?: string;
}

// src/types/index.ts

export interface PatientType {
  username: string;
  _id: string;
  first_name: string;
  name: string;
  age: string | number;
  diagnosis: string[];
  sex: string;
  duration: number;
}

export interface AuthPayload {
  access_token: string;
  refresh_token: string;
  user_type: string;
  id: string;
  full_name: string;
  specialisation: string;
}
export interface FeedbackEntry {
  question: {
    id: string;
    translations: Translation[];
  };
  comment: string;
  answer: AnswerOption[];
}
// types/UserType.ts
export interface UserType {
  email: string;
  phone?: string;
  first_name?: string;
  name?: string;
  specializations?: string[];
  clinics?: string[];
  projects?: string[];
}
export interface PendingEntry {
  id: number;
  type: string;
  name: string;
  email?: string;
  [key: string]: unknown; // ✅ unknown is allowed, unlike `any`
}

export interface InterventionLog {
  datetime: string;
  status: 'completed' | 'missed' | 'today' | 'upcoming';
  feedback?: FeedbackEntry[];
}

export interface InterventionAssignment {
  _id: string;
  title: string;
  notes?: string;
  frequency: string;
  duration: number;
  content_type: string;
  tags: string[];
  benefitFor: string[];
  preview_img: string;
  media_url?: string;
  link?: string;
  dates: InterventionLog[];
  currentTotalCount: number;
  completedCount: number;
}

export interface RehabPlanResponse {
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  interventions: InterventionAssignment[];
}

export interface Intervention {
  _id: string;
  title: string;
  description: string;
  content_type: string;
  patient_types: {
    type: string;
    frequency: string;
    include_option: boolean;
    diagnosis: string;
  }[];
  tags: string[];
  benefitFor: string[];
  link?: string;
  media_url?: string;
  preview_img?: string;
  duration: number;
}
// types/index.ts

export interface Intervention {
  _id: string;
  title: string;
  content_type: string;
  media_url?: string;
  link?: string;
  preview_img?: string;
  benefitFor?: string[];
  tags?: string[];
  dates?: InterventionDate[];
  currentTotalCount?: number;
  completedCount?: number;
  duration?: number;
}

export interface InterventionDate {
  datetime: string;
  status: 'completed' | 'missed' | 'today' | 'upcoming';
  feedback?: FeedbackEntry[];
}

export interface FeedbackEntry {
  question: {
    id: string;
    translations: Translation[];
  };
  comment?: string;
  answer: FeedbackAnswer[];
}

export interface FeedbackAnswer {
  key: string;
  translations: Translation[];
}

export interface Translation {
  language: string;
  text: string;
}
