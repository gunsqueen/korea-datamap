import localCouncilEmdMapping from '../data/static/local_council_emd_mapping.json';

export type LocalCouncilKind = 'basic' | 'council';

const LOCAL_COUNCIL_EMD_MAPPING = localCouncilEmdMapping as Record<
  string,
  Partial<Record<LocalCouncilKind, Record<string, string[]>>>
>;

function getLookupSources(generation: string): string[] {
  return generation === '9' ? ['9', '8'] : [generation];
}

function getMergeSources(generation: string): string[] {
  return generation === '9' ? ['8', '9'] : [generation];
}

export function getLocalCouncilGenerations(): string[] {
  return Object.keys(LOCAL_COUNCIL_EMD_MAPPING).sort((a, b) => Number(b) - Number(a));
}

export function getLocalCouncilKinds(generation: string): LocalCouncilKind[] {
  const kinds = new Set<LocalCouncilKind>();

  for (const source of getMergeSources(generation)) {
    for (const kind of Object.keys(LOCAL_COUNCIL_EMD_MAPPING[source] ?? {}) as LocalCouncilKind[]) {
      kinds.add(kind);
    }
  }

  return Array.from(kinds);
}

export function getLocalCouncilDistrictCodes(
  generation: string,
  kind: LocalCouncilKind,
  districtKey: string,
): string[] {
  for (const source of getLookupSources(generation)) {
    const codes = LOCAL_COUNCIL_EMD_MAPPING[source]?.[kind]?.[districtKey];
    if (codes?.length) return codes;
  }

  return [];
}

export function getLocalCouncilDistrictEntries(
  generation: string,
  kind: LocalCouncilKind,
): Array<[string, string[]]> {
  const merged = new Map<string, string[]>();

  for (const source of getMergeSources(generation)) {
    for (const [districtKey, codes] of Object.entries(LOCAL_COUNCIL_EMD_MAPPING[source]?.[kind] ?? {})) {
      if (!codes?.length) continue;
      merged.set(districtKey, codes);
    }
  }

  return Array.from(merged.entries());
}

export function findLocalCouncilDistrictByAdmCd(
  admCd: string,
  generation: string,
  kind: LocalCouncilKind,
): { districtKey: string; codes: string[] } | null {
  for (const source of getLookupSources(generation)) {
    for (const [districtKey, codes] of Object.entries(LOCAL_COUNCIL_EMD_MAPPING[source]?.[kind] ?? {})) {
      if (codes.includes(admCd)) {
        return { districtKey, codes };
      }
    }
  }

  return null;
}
