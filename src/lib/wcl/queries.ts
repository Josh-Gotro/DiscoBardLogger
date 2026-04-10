import { wclClientQuery } from "@/lib/wcl/graphql";

type ReportOverviewResponse = {
  reportData: {
    report: {
      code: string;
      title: string | null;
      owner?: {
        name?: string | null;
      } | null;
      fights?: Array<{
        id: number;
        encounterID?: number | null;
        name?: string | null;
        kill?: boolean | null;
        difficulty?: number | null;
        startTime?: number | null;
        endTime?: number | null;
      }> | null;
      masterData?: {
        actors?: Array<{
          id: number;
          name?: string | null;
          type?: string | null;
          subType?: string | null;
          server?: string | null;
        }> | null;
      } | null;
    } | null;
  };
};

type ReportEventsResponse = {
  reportData: {
    report: {
      events: {
        data: Array<Record<string, unknown>>;
        nextPageTimestamp: number | null;
      };
    } | null;
  };
};

const REPORT_OVERVIEW_QUERY = `
  query ReportOverview($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        owner {
          name
        }
        fights {
          id
          encounterID
          name
          kill
          difficulty
          startTime
          endTime
        }
        masterData {
          actors {
            id
            name
            type
            subType
            server
          }
        }
      }
    }
    rateLimitData {
      limitPerHour
      pointsSpentThisHour
      pointsResetIn
    }
  }
`;

const REPORT_EVENTS_QUERY = `
  query ReportEvents(
    $code: String!
    $fightIDs: [Int]
    $sourceID: Int
    $dataType: EventDataType
    $startTime: Float
  ) {
    reportData {
      report(code: $code) {
        events(
          dataType: $dataType
          fightIDs: $fightIDs
          sourceID: $sourceID
          limit: 10000
          startTime: $startTime
          useAbilityIDs: true
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

const ENCOUNTER_CHARACTER_RANKINGS_QUERY = `
  query EncounterCharacterRankings(
    $encounterID: Int!
    $difficulty: Int
    $className: String
    $specName: String
    $metric: CharacterRankingMetricType
    $size: Int
    $partition: Int
    $serverRegion: String
    $bracket: Int
    $page: Int
  ) {
    worldData {
      encounter(id: $encounterID) {
        id
        name
        characterRankings(
          difficulty: $difficulty
          className: $className
          specName: $specName
          metric: $metric
          size: $size
          partition: $partition
          serverRegion: $serverRegion
          bracket: $bracket
          page: $page
        )
      }
    }
    rateLimitData {
      limitPerHour
      pointsSpentThisHour
      pointsResetIn
    }
  }
`;

export type WclFight = {
  id: number;
  encounterID: number | null;
  name: string;
  kill: boolean;
  difficulty: number | null;
  startTime: number;
  endTime: number;
  durationMs: number;
};

export type WclActor = {
  id: number;
  name: string;
  type: string | null;
  subType: string | null;
  server: string | null;
};

export async function fetchReportOverview(code: string) {
  const data = await wclClientQuery<ReportOverviewResponse>(REPORT_OVERVIEW_QUERY, {
    code,
  });

  const report = data.reportData.report;
  if (!report) {
    throw new Error("Report not found or inaccessible in client scope.");
  }

  const fights: WclFight[] = (report.fights ?? [])
    .filter((fight) => fight.startTime != null && fight.endTime != null)
    .map((fight) => {
      const startTime = Number(fight.startTime);
      const endTime = Number(fight.endTime);
      return {
        id: fight.id,
        encounterID: fight.encounterID ?? null,
        name: fight.name ?? "Unknown Fight",
        kill: Boolean(fight.kill),
        difficulty: fight.difficulty ?? null,
        startTime,
        endTime,
        durationMs: Math.max(0, endTime - startTime),
      };
    });

  const actors: WclActor[] = (report.masterData?.actors ?? []).map((actor) => ({
    id: actor.id,
    name: actor.name ?? "Unknown Actor",
    type: actor.type ?? null,
    subType: actor.subType ?? null,
    server: actor.server ?? null,
  }));

  return {
    code: report.code,
    title: report.title ?? "Untitled Report",
    ownerName: report.owner?.name ?? null,
    fights,
    actors,
  };
}

function extractRankingsPayload(value: unknown): Array<Record<string, unknown>> {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
    );
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return extractRankingsPayload(parsed);
    } catch {
      return [];
    }
  }
  if (typeof value === "object") {
    const maybeData = (value as Record<string, unknown>).data;
    if (Array.isArray(maybeData)) {
      return maybeData.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      );
    }
  }
  return [];
}

export type BenchmarkCandidate = {
  rank: number | null;
  amount: number | null;
  reportCode: string;
  fightID: number | null;
  sourceID: number | null;
  characterName: string | null;
  totalTimeSeconds: number | null;
};

export async function fetchBenchmarkCandidates(args: {
  encounterID: number;
  difficulty?: number;
  className?: string;
  specName?: string;
  metric?: string;
  size?: number;
  partition?: number;
  serverRegion?: string;
  bracket?: number;
  page?: number;
}) {
  const data = await wclClientQuery<{
    worldData?: {
      encounter?: {
        id?: number;
        name?: string;
        characterRankings?: unknown;
      } | null;
    } | null;
  }>(ENCOUNTER_CHARACTER_RANKINGS_QUERY, args);

  const encounter = data.worldData?.encounter;
  if (!encounter) {
    throw new Error("Encounter rankings could not be loaded.");
  }

  const rows = extractRankingsPayload(encounter.characterRankings);
  const candidates: BenchmarkCandidate[] = rows
    .map((row) => {
      const reportCode =
        asString(row.reportCode) ??
        asString((row.report as Record<string, unknown> | undefined)?.code);
      if (!reportCode) {
        return null;
      }
      return {
        rank: asNumber(row.rank),
        amount: asNumber(row.amount),
        reportCode,
        fightID: asNumber(row.fightID),
        sourceID: asNumber(row.sourceID),
        characterName: asString(row.name),
        totalTimeSeconds: asNumber(row.totalTime),
      } satisfies BenchmarkCandidate;
    })
    .filter((value): value is BenchmarkCandidate => value !== null);

  return {
    encounterID: encounter.id ?? args.encounterID,
    encounterName: encounter.name ?? "Unknown Encounter",
    candidates,
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

type RawEvent = {
  timestamp?: number;
  abilityGameID?: number;
  ability?: { name?: string };
  type?: string;
};

type FightEventSlice = {
  casts: RawEvent[];
  buffs: RawEvent[];
  deaths: RawEvent[];
  resources: RawEvent[];
};

async function fetchEventsByType(args: {
  reportCode: string;
  fightID: number;
  sourceID: number;
  dataType: "Casts" | "Buffs" | "Deaths" | "Resources";
}) {
  const collected: RawEvent[] = [];
  let startTime: number | null = null;
  let page = 0;

  while (page < 5) {
    const responseBody: ReportEventsResponse =
      await wclClientQuery<ReportEventsResponse>(
      REPORT_EVENTS_QUERY,
      {
        code: args.reportCode,
        fightIDs: [args.fightID],
        sourceID: args.sourceID,
        dataType: args.dataType,
        startTime,
      },
    );

    const payload = responseBody.reportData.report?.events;
    if (!payload) {
      break;
    }

    collected.push(...(payload.data as RawEvent[]));
    if (!payload.nextPageTimestamp) {
      break;
    }

    startTime = payload.nextPageTimestamp;
    page += 1;
  }

  return collected;
}

function toRelativeTimeline(events: RawEvent[], startTime: number) {
  return events
    .filter((event) => typeof event.timestamp === "number")
    .map((event) => ({
      t: Math.max(0, (Number(event.timestamp) - startTime) / 1000),
      abilityID: typeof event.abilityGameID === "number" ? event.abilityGameID : null,
      abilityName:
        typeof event.ability?.name === "string" ? event.ability.name : "Unknown Ability",
      type: typeof event.type === "string" ? event.type : "event",
    }))
    .sort((a, b) => a.t - b.t);
}

async function fetchFightEventSlice(args: {
  reportCode: string;
  fightID: number;
  sourceID: number;
}): Promise<FightEventSlice> {
  const [casts, buffs, deaths, resources] = await Promise.all([
    fetchEventsByType({ ...args, dataType: "Casts" }),
    fetchEventsByType({ ...args, dataType: "Buffs" }),
    fetchEventsByType({ ...args, dataType: "Deaths" }),
    fetchEventsByType({ ...args, dataType: "Resources" }),
  ]);

  return {
    casts: casts,
    buffs: buffs,
    deaths: deaths,
    resources: resources,
  };
}

function mapAbilityCounts(casts: ReturnType<typeof toRelativeTimeline>) {
  const counts = new Map<string, number>();
  for (const cast of casts) {
    counts.set(cast.abilityName, (counts.get(cast.abilityName) ?? 0) + 1);
  }
  return counts;
}

function computeTopCastDiff(args: {
  userCasts: ReturnType<typeof toRelativeTimeline>;
  referenceCasts: ReturnType<typeof toRelativeTimeline>;
}) {
  const userCounts = mapAbilityCounts(args.userCasts);
  const referenceCounts = mapAbilityCounts(args.referenceCasts);
  const abilities = new Set([...userCounts.keys(), ...referenceCounts.keys()]);

  const differences = [...abilities]
    .map((abilityName) => {
      const user = userCounts.get(abilityName) ?? 0;
      const reference = referenceCounts.get(abilityName) ?? 0;
      return {
        abilityName,
        userCount: user,
        referenceCount: reference,
        delta: reference - user,
      };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return differences.slice(0, 8);
}

function computeOpenerDrift(args: {
  userCasts: ReturnType<typeof toRelativeTimeline>;
  referenceCasts: ReturnType<typeof toRelativeTimeline>;
}) {
  const userOpener = args.userCasts.slice(0, 12);
  const referenceByAbility = new Map<string, number[]>();

  for (const cast of args.referenceCasts.slice(0, 40)) {
    const list = referenceByAbility.get(cast.abilityName) ?? [];
    list.push(cast.t);
    referenceByAbility.set(cast.abilityName, list);
  }

  return userOpener
    .map((cast) => {
      const firstReference = referenceByAbility.get(cast.abilityName)?.[0];
      if (firstReference == null) {
        return null;
      }
      return {
        abilityName: cast.abilityName,
        userTime: cast.t,
        referenceTime: firstReference,
        driftSeconds: Number((cast.t - firstReference).toFixed(2)),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Math.abs(b.driftSeconds) - Math.abs(a.driftSeconds))
    .slice(0, 8);
}

export async function compareFightPair(args: {
  userReportCode: string;
  userFightID: number;
  userSourceID: number;
  referenceReportCode: string;
  referenceFightID: number;
  referenceSourceID: number;
}) {
  const [userOverview, referenceOverview] = await Promise.all([
    fetchReportOverview(args.userReportCode),
    fetchReportOverview(args.referenceReportCode),
  ]);

  const userFight = userOverview.fights.find((fight) => fight.id === args.userFightID);
  const referenceFight = referenceOverview.fights.find(
    (fight) => fight.id === args.referenceFightID,
  );

  if (!userFight || !referenceFight) {
    throw new Error("Could not find one of the selected fights.");
  }

  const [userEvents, referenceEvents] = await Promise.all([
    fetchFightEventSlice({
      reportCode: args.userReportCode,
      fightID: args.userFightID,
      sourceID: args.userSourceID,
    }),
    fetchFightEventSlice({
      reportCode: args.referenceReportCode,
      fightID: args.referenceFightID,
      sourceID: args.referenceSourceID,
    }),
  ]);

  const userCasts = toRelativeTimeline(userEvents.casts, userFight.startTime);
  const referenceCasts = toRelativeTimeline(
    referenceEvents.casts,
    referenceFight.startTime,
  );
  const userBuffs = toRelativeTimeline(userEvents.buffs, userFight.startTime);
  const referenceBuffs = toRelativeTimeline(
    referenceEvents.buffs,
    referenceFight.startTime,
  );

  const topCastDiff = computeTopCastDiff({
    userCasts,
    referenceCasts,
  });
  const openerDrift = computeOpenerDrift({
    userCasts,
    referenceCasts,
  });

  return {
    userFight,
    referenceFight,
    timeline: {
      userCasts: userCasts.slice(0, 2500),
      referenceCasts: referenceCasts.slice(0, 2500),
      userBuffs: userBuffs.slice(0, 1500),
      referenceBuffs: referenceBuffs.slice(0, 1500),
    },
    insights: {
      topCastDiff,
      openerDrift,
      userCastCount: userCasts.length,
      referenceCastCount: referenceCasts.length,
      userBuffEvents: userBuffs.length,
      referenceBuffEvents: referenceBuffs.length,
    },
  };
}
