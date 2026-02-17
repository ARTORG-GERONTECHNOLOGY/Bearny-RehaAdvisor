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
