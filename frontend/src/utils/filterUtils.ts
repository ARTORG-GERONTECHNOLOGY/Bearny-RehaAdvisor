import type { Intervention } from '@/types';

// Maps frontend taxonomy display labels to the canonical storage values they represent.
// "brochure" matches both legacy "brochure" and new "pdf" stored values.
// "graphics" matches both legacy "graphics" and new "image" stored values.
const CONTENT_TYPE_LABEL_TO_CANONICAL: Record<string, string[]> = {
  brochure: ['brochure', 'pdf'],
  graphics: ['graphics', 'image'],
};

export const filterInterventions = (
  recommendations: Intervention[],
  translatedTitles: Record<string, { title: string; lang: string | null }> | undefined,
  filters: {
    diagnosisFilter: string[];
    languageFilter: string[];
    contentTypeFilter: string;
    tagFilter: string[];
    benefitForFilter: string[];
    searchTerm: string;
    includeTagsInSearch?: boolean;
    getTagLabel?: (tag: string) => string;
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

  if (filters.languageFilter?.length) {
    result = result.filter((rec) => {
      const langs: string[] = Array.isArray((rec as any).available_languages)
        ? (rec as any).available_languages
        : [(rec as any).language].filter(Boolean);
      return langs.some((l: string) => filters.languageFilter.includes(l.toLowerCase()));
    });
  }

  if (filters.contentTypeFilter) {
    const raw = filters.contentTypeFilter.toLowerCase();
    const needles = CONTENT_TYPE_LABEL_TO_CANONICAL[raw] ?? [raw];
    result = result.filter((rec) => needles.includes((rec.content_type || '').toLowerCase()));
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
      const allTitles: string[] = (rec as any).all_titles ?? [];
      const matchesTags =
        filters.includeTagsInSearch === true &&
        (rec.tags ?? []).some((tag) => {
          const label = filters.getTagLabel ? filters.getTagLabel(tag) : tag;
          return label.toLowerCase().includes(searchLower);
        });
      return (
        originalTitle.includes(searchLower) ||
        translatedTitle?.includes(searchLower) ||
        allTitles.some((t) => t.toLowerCase().includes(searchLower)) ||
        matchesTags
      );
    });
  }

  return result;
};
