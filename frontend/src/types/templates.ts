// src/types/templates.ts
export type TemplateOcc = { day: number; time?: string };

export type TemplateScheduleEnd =
  | { type: 'never' }
  | { type: 'date'; date: string } // ISO date string e.g. "2026-02-16"
  | { type: 'count'; count: number };

export type TemplateItem = {
  diagnosis: string;
  intervention: {
    _id: string;
    title: string;
    duration?: number;
    content_type?: string;
    tags?: string[];
  };
  schedule: {
    unit: 'day' | 'week' | 'month';
    interval: number;
    selectedDays: string[];
    end: TemplateScheduleEnd;
  };
  occurrences: TemplateOcc[];
};

export type TemplatePayload = { horizon_days: number; items: TemplateItem[] };

// Named InterventionTemplate document returned by /api/templates/
export type TemplateDoc = {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  created_by: string;
  created_by_name: string;
  specialization: string | null;
  diagnosis: string | null;
  intervention_count: number;
  createdAt: string;
  updatedAt: string;
  recommendations?: TemplateRecommendation[];
};

export type TemplateScheduleBlock = {
  active: boolean;
  interval: number;
  unit: 'day' | 'week' | 'month';
  selected_days: string[];
  start_day: number;
  end_day: number | null;
  suggested_execution_time: number | null;
};

export type TemplateRecommendation = {
  intervention_id: string | null;
  intervention_title: string | null;
  diagnosis_assignments: Record<string, TemplateScheduleBlock[]>;
};
