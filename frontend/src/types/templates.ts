// src/types/templates.ts
export type TemplateOcc = { day: number; time?: string };

export type ScheduleUnit = 'day' | 'week' | 'month';

// One stored block of an item's schedule, as returned by the calendar endpoints.
export type TemplateSegmentPayload = {
  unit: ScheduleUnit;
  interval: number;
  selected_days: string[];
  start_day: number;
  end_day: number;
  start_time: string;
};

export type TemplateItem = {
  diagnosis: string;
  intervention: {
    _id: string;
    title: string;
    duration?: number;
    content_type?: string;
    tags?: string[];
  };
  // The latest segment, summarised.
  schedule: {
    unit: ScheduleUnit;
    interval: number;
    selectedDays: string[];
    start_day: number;
    end_day: number | null;
  };
  occurrences: TemplateOcc[];
  segments?: TemplateSegmentPayload[];
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
  unit: ScheduleUnit;
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
