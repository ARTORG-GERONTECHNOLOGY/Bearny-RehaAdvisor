import { makeAutoObservable } from 'mobx';
import interventionsConfig from '../config/interventions.json'; // <-- your file (see note below)

// If your config is intervention.js exporting default object,
// change import to: import interventionsConfig from '../config/intervention';

type Option = { value: string; label: string };

class InterventionsTaxonomyStore {
  taxonomy = (interventionsConfig as any)?.interventionsTaxonomy || {};

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // ---------- raw lists ----------
  get inputFrom(): string[] {
    return this.taxonomy?.input_from || [];
  }

  get lc9(): string[] {
    return this.taxonomy?.lc9 || [];
  }

  get originalLanguages(): string[] {
    return this.taxonomy?.original_languages || [];
  }

  get primaryDiagnoses(): string[] {
    return this.taxonomy?.primary_diagnoses || [];
  }

  get aims(): string[] {
    return this.taxonomy?.aims || [];
  }

  get topics(): string[] {
    return this.taxonomy?.topics || [];
  }

  get cognitiveLevels(): string[] {
    return this.taxonomy?.cognitive_levels || [];
  }

  get physicalLevels(): string[] {
    return this.taxonomy?.physical_levels || [];
  }

  get frequencyTime(): string[] {
    return this.taxonomy?.frequency_time || [];
  }

  get timing(): string[] {
    return this.taxonomy?.timing || [];
  }

  // IMPORTANT: your taxonomy uses lowercase: ["text","video","audio"...]
  get contentTypes(): string[] {
    return this.taxonomy?.content_types || [];
  }

  get durationBuckets(): string[] {
    return this.taxonomy?.duration_buckets || [];
  }

  get sexSpecific(): string[] {
    return this.taxonomy?.sex_specific || [];
  }

  get where(): string[] {
    return this.taxonomy?.where || [];
  }

  get setting(): string[] {
    return this.taxonomy?.setting || [];
  }

  // ---------- helper for react-select ----------
  toOptions(values: string[]): Option[] {
    return (values || []).map((v) => ({
      value: v,
      label: v,
    }));
  }
}

export const interventionsTaxonomyStore = new InterventionsTaxonomyStore();
export default interventionsTaxonomyStore;
