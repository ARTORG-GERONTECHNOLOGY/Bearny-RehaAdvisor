export const filterInterventions = (
  recommendations: Intervention[],
  filters: {
    patientTypeFilter: string;
    contentTypeFilter: string;
    tagFilter: string[];
    benefitForFilter: string[];
    searchTerm: string;
  }
): Intervention[] => {
  let result = [...recommendations];

  if (filters.patientTypeFilter) {
    result = result.filter((rec) =>
      rec.patient_types.some((pt) => pt.diagnosis === filters.patientTypeFilter)
    );
  }

  if (filters.contentTypeFilter) {
    result = result.filter((rec) => rec.content_type === filters.contentTypeFilter);
  }

  if (filters.tagFilter.length > 0) {
    result = result.filter((rec) => rec.tags.some((tag) => filters.tagFilter.includes(tag)));
  }

  if (filters.benefitForFilter.length > 0) {
    result = result.filter((rec) =>
      rec.benefitFor.some((benefit) => filters.benefitForFilter.includes(benefit))
    );
  }

  if (filters.searchTerm) {
    result = result.filter((rec) =>
      rec.title.toLowerCase().includes(filters.searchTerm.toLowerCase())
    );
  }

  return result;
};
