// src/types/templates.ts
export type TemplateOcc = { day: number; time?: string };
export type TemplateItem = {
  diagnosis: string;
  intervention: { _id: string; title: string; duration?: number; content_type?: string; tags?: string[] };
  schedule: { unit: 'day'|'week'|'month'; interval: number; selectedDays: string[]; end: any };
  occurrences: TemplateOcc[];
};
export type TemplatePayload = { horizon_days: number; items: TemplateItem[] };
