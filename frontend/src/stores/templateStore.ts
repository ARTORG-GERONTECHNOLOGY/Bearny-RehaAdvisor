// src/stores/templateStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import type { TemplateDoc } from '../types/templates';

type Filters = {
  name?: string;
  specialization?: string;
  diagnosis?: string;
};

class TemplateStore {
  templates: TemplateDoc[] = [];
  loading = false;
  error = '';

  constructor() {
    makeAutoObservable(this);
  }

  async fetchTemplates(filters: Filters = {}) {
    runInAction(() => {
      this.loading = true;
      this.error = '';
    });
    try {
      const params = new URLSearchParams();
      if (filters.name) params.set('name', filters.name);
      if (filters.specialization) params.set('specialization', filters.specialization);
      if (filters.diagnosis) params.set('diagnosis', filters.diagnosis);

      const res = await apiClient.get<{ templates: TemplateDoc[] }>(
        `templates/?${params.toString()}`
      );
      runInAction(() => {
        this.templates = res.data.templates;
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.error || 'Failed to load templates.';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async createTemplate(payload: {
    name: string;
    description: string;
    is_public: boolean;
    specialization?: string;
    diagnosis?: string;
  }): Promise<TemplateDoc> {
    const res = await apiClient.post<{ template: TemplateDoc }>('templates/', payload);
    runInAction(() => {
      this.templates = [res.data.template, ...this.templates];
    });
    return res.data.template;
  }

  async deleteTemplate(id: string) {
    await apiClient.delete(`templates/${id}/`);
    runInAction(() => {
      this.templates = this.templates.filter((t) => t.id !== id);
    });
  }

  async copyTemplate(id: string, name?: string, description?: string): Promise<TemplateDoc> {
    const body: Record<string, string> = {};
    if (name) body.name = name;
    if (description !== undefined) body.description = description;
    const res = await apiClient.post<{ template: TemplateDoc }>(`templates/${id}/copy/`, body);
    runInAction(() => {
      this.templates = [res.data.template, ...this.templates];
    });
    return res.data.template;
  }

  async updateTemplate(
    id: string,
    patch: Partial<
      Pick<TemplateDoc, 'name' | 'description' | 'is_public' | 'specialization' | 'diagnosis'>
    >
  ): Promise<TemplateDoc> {
    const res = await apiClient.patch<{ template: TemplateDoc }>(`templates/${id}/`, patch);
    runInAction(() => {
      this.templates = this.templates.map((t) => (t.id === id ? res.data.template : t));
    });
    return res.data.template;
  }

  clearError() {
    this.error = '';
  }
}

export const templateStore = new TemplateStore();
export default templateStore;
