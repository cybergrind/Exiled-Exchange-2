// "Used by": the surveyed builds that use a unique (data/poe-source/
// unique-builds.json, from research/uniques/_meta-builds.md via
// tools/build-unique-builds.ts). Public guides and tier lists only.
// Pure: no Vue, no `@/`.

export interface SurveyBuild {
  id: number;
  name: string;
  rank: string;
  url: string;
  date: string;
}

export interface BuildUse {
  build: number;
  core: boolean;
  label?: string;
}

export interface UniqueBuildsFile {
  league: string;
  verifiedOn: string;
  builds: SurveyBuild[];
  uniques: Record<string, BuildUse[]>;
}

export interface BuildUsage {
  name: string;
  url: string;
  /** "required", or the guide's word for an optional pick. */
  role: string;
  core: boolean;
  title: string;
}

/** Builds that require the unique first, then the rest, each in rank order. */
export function buildUsage(
  file: UniqueBuildsFile | undefined,
  unique: string,
): BuildUsage[] {
  const uses = file?.uniques[unique] ?? [];
  const byId = new Map(file?.builds.map((b) => [b.id, b]));
  return uses
    .flatMap((use) => {
      const build = byId.get(use.build);
      return build ? [{ use, build }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.use.core) - Number(a.use.core) || a.build.id - b.build.id,
    )
    .map(({ use, build }) => {
      const role = use.core ? "required" : (use.label ?? "optional");
      return {
        name: build.name,
        url: build.url,
        role,
        core: use.core,
        title: `${build.name}: ${role} · ${build.rank} · guide ${build.date}`,
      };
    });
}
