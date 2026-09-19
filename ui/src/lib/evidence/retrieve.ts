import inspiration4 from "@/data/osdr-inspiration4.json";
import relationships from "@/data/osdr-spaceflight-relationships.json";
import edaCabin from "@/data/eda-cabin-telemetry.json";
import radlab from "@/data/radlab-radiation.json";
import type { EnvironmentReading } from "@/lib/db/types";
import type { EvidenceKind } from "@/lib/investigation/types";
import type { VitalMetricKey, VitalsCollected } from "@/lib/investigation/types";

export type EvidenceLayer =
  | "astronaut"
  | "spacecraft"
  | "space"
  | "historical";

export type RetrievedEvidenceCard = {
  layer: EvidenceLayer;
  kind: EvidenceKind;
  title: string;
  body: string;
  sourceLabel: string;
  citationUrl?: string;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type RetrievalContext = {
  crewId: string;
  symptomTags: string[];
  vitals: VitalsCollected;
  vitalDeviations: VitalMetricKey[];
  cabinReadings: EnvironmentReading[];
};

function scoreTags(candidate: string[], query: string[]): number {
  let score = 0;
  for (const tag of candidate) {
    if (query.includes(tag)) score += 2;
  }
  return score;
}

function buildQueryTags(ctx: RetrievalContext): string[] {
  const tags = new Set<string>(ctx.symptomTags.map((t) => t.toLowerCase()));
  for (const metric of ctx.vitalDeviations) {
    tags.add(metric);
    if (metric === "heart_rate") {
      tags.add("cardiovascular");
      tags.add("heart_rate");
    }
  }
  for (const reading of ctx.cabinReadings) {
    if (reading.status !== "nominal") {
      tags.add(reading.metricKey);
      if (reading.metricKey === "co2_ppm") {
        tags.add("co2");
        tags.add("environment");
        tags.add("headache");
      }
    }
  }
  tags.add("spaceflight");
  tags.add("radiation");
  tags.add("space_environment");
  return [...tags];
}

function extractSymptomTagsFromEvidenceBodies(bodies: string[]): string[] {
  const known = [
    "headache",
    "dizzy",
    "dizziness",
    "fatigue",
    "nausea",
    "inflammation",
  ];
  const found = new Set<string>();
  for (const body of bodies) {
    const lower = body.toLowerCase();
    for (const word of known) {
      if (lower.includes(word)) {
        found.add(word === "dizzy" ? "dizziness" : word);
        if (word === "dizziness" || word === "dizzy") {
          found.add("headache");
        }
      }
    }
  }
  return [...found];
}

export function inferSymptomTags(texts: string[]): string[] {
  return extractSymptomTagsFromEvidenceBodies(texts);
}

export function retrieveMultiSourceEvidence(
  ctx: RetrievalContext,
): RetrievedEvidenceCard[] {
  const query = buildQueryTags(ctx);
  const cards: RetrievedEvidenceCard[] = [];

  const anomalies = ctx.cabinReadings.filter((r) => r.status !== "nominal");

  for (const reading of anomalies) {
    const direction =
      reading.status === "above_nominal" ? "above" : "below";
    cards.push({
      layer: "spacecraft",
      kind: "correlation",
      title: `Live cabin: ${reading.metricKey}`,
      body: `Cabin ${reading.metricKey} (${reading.value} ${reading.unit}) is ${direction} the nominal range while ${ctx.crewId} is under investigation. Correlation lead only — not evidence of causation.`,
      sourceLabel: "Live spacecraft telemetry",
      tags: [reading.metricKey, "environment"],
      metadata: {
        layer: "spacecraft",
        metricKey: reading.metricKey,
        value: reading.value,
        status: reading.status,
      },
    });
  }

  const edaHits = edaCabin.snippets
    .map((snippet) => ({
      snippet,
      score: scoreTags(snippet.tags, query),
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  for (const { snippet } of edaHits) {
    cards.push({
      layer: "spacecraft",
      kind: "correlation",
      title: snippet.label,
      body: `${snippet.summary} Source: NASA OSDR EDA-style cabin telemetry cache.`,
      sourceLabel: "NASA OSDR EDA (cache)",
      citationUrl: edaCabin.citation_url,
      tags: snippet.tags,
      metadata: {
        layer: "spacecraft",
        edaId: snippet.id,
        metricKey: snippet.metric_key,
        citation_url: edaCabin.citation_url,
      },
    });
  }

  if (anomalies.length === 0 && edaHits.length === 0) {
    cards.push({
      layer: "spacecraft",
      kind: "correlation",
      title: "Cabin environment reviewed",
      body: "Spacecraft environmental readings were within nominal limits at review time. No cabin correlation lead was identified.",
      sourceLabel: "Live spacecraft telemetry",
      tags: ["environment"],
      metadata: { layer: "spacecraft" },
    });
  }

  const radlabScore = scoreTags(radlab.tags, query);
  if (radlabScore > 0 || radlab.status === "elevated_vs_recent_baseline") {
    cards.push({
      layer: "space",
      kind: "correlation",
      title: "RadLab radiation window (elevated vs recent baseline)",
      body: radlab.summary,
      sourceLabel: "NASA RadLab (cache)",
      citationUrl: radlab.fetched_from,
      tags: radlab.tags,
      metadata: {
        layer: "space",
        status: radlab.status,
        baseline_dose_equivalent_rate: radlab.baseline_dose_equivalent_rate,
        spacecraft_proxy: radlab.spacecraft_proxy,
        citation_url: radlab.fetched_from,
      },
    });
  }

  const studyHits = inspiration4.studies
    .map((study) => ({
      study,
      score: scoreTags(study.tags, query),
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  for (const { study } of studyHits) {
    cards.push({
      layer: "historical",
      kind: "historical_context",
      title: `${study.study_id}: ${study.title}`,
      body: study.observed_change_summary,
      sourceLabel: `NASA OSDR ${study.study_id}`,
      citationUrl: study.citation_url,
      tags: study.tags,
      metadata: {
        layer: "historical",
        study_id: study.study_id,
        population: study.population,
        citation_url: study.citation_url,
      },
    });
  }

  const relHits = relationships.relationships
    .map((rel) => ({
      rel,
      score: scoreTags(rel.tags, query),
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  for (const { rel } of relHits) {
    cards.push({
      layer: "historical",
      kind: "historical_context",
      title: `Relationship: ${rel.from} → ${rel.to}`,
      body: `${rel.summary} Model: ${rel.model}. ${rel.confidence_note}`,
      sourceLabel: rel.source_study,
      citationUrl: rel.citation_url,
      tags: rel.tags,
      metadata: {
        layer: "historical",
        relationship_id: rel.id,
        model: rel.model,
        citation_url: rel.citation_url,
      },
    });
  }

  return cards;
}

export function groupEvidenceByLayer(
  evidence: Array<{
    id: number;
    kind: EvidenceKind;
    title: string;
    body: string;
    metadata: Record<string, unknown> | null;
  }>,
): Record<EvidenceLayer, typeof evidence> {
  const groups: Record<EvidenceLayer, typeof evidence> = {
    astronaut: [],
    spacecraft: [],
    space: [],
    historical: [],
  };

  for (const item of evidence) {
    const layer = item.metadata?.layer;
    if (
      layer === "astronaut" ||
      layer === "spacecraft" ||
      layer === "space" ||
      layer === "historical"
    ) {
      groups[layer].push(item);
      continue;
    }
    if (item.kind === "historical_context") {
      groups.historical.push(item);
    } else if (item.kind === "personal_deviation" || item.kind === "observation") {
      groups.astronaut.push(item);
    } else if (item.kind === "correlation") {
      groups.spacecraft.push(item);
    } else {
      groups.astronaut.push(item);
    }
  }

  return groups;
}
