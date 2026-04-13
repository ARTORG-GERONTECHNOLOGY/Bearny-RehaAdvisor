import type { Intervention } from '@/types';

export const filterInterventions = (
  recommendations: Intervention[],
  translatedTitles: Record<string, { title: string; lang: string | null }> | undefined,
  filters: {
    diagnosisFilter: string[];
    contentTypeFilter: string;
    tagFilter: string[];
    benefitForFilter: string[];
    searchTerm: string;
  }
): Intervention[] => {
  let result = [...recommendations];

  if (filters.diagnosisFilter?.length) {
    result = result.filter((rec) => {
      const diags = Array.isArray((rec as any).primary_diagnosis)
        ? (rec as any).primary_diagnosis
        : [];
      return diags.some((d: string) => filters.diagnosisFilter.includes(d));
    });
  }

  if (filters.contentTypeFilter) {
    result = result.filter((rec) => rec.content_type === filters.contentTypeFilter);
  }

  if (filters.tagFilter.length > 0) {
    result = result.filter((rec) => rec.tags?.some((tag) => filters.tagFilter.includes(tag)));
  }

  if (filters.benefitForFilter.length > 0) {
    result = result.filter((rec) => {
      // Backend returns 'aims', but types use 'benefitFor' - check both
      const aims = (rec as any).aims || rec.benefitFor || [];
      return (
        Array.isArray(aims) && aims.some((benefit) => filters.benefitForFilter.includes(benefit))
      );
    });
  }

  if (filters.searchTerm) {
    const searchLower = filters.searchTerm.toLowerCase();
    result = result.filter((rec) => {
      const originalTitle = rec.title.toLowerCase();
      const translatedTitle = translatedTitles?.[rec._id]?.title?.toLowerCase();
      return originalTitle.includes(searchLower) || translatedTitle?.includes(searchLower);
    });
  }

  return result;
};
