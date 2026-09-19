import type { Patient, Transform } from "@/server/iris/types";

const ICD_CHAPTERS: Record<string, string> = {
  E: "Endocrine / metabolic category",
  F: "Mental and behavioural category",
  I: "Circulatory system category",
  J: "Respiratory system category",
  K: "Digestive system category",
  M: "Musculoskeletal category",
  R: "Symptoms and signs category",
  Z: "Encounter factors category",
};

export function ageBand(dateOfBirth: string, now = new Date()): string {
  const dob = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() &&
      now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  const lower = Math.floor(age / 5) * 5;
  return `Age ${lower}-${lower + 5}`;
}

function diagnosisCategory(value: string): string {
  const code = /\(([A-Z])\d/.exec(value);
  const chapter = code?.[1] ? ICD_CHAPTERS[code[1]] : undefined;
  return chapter ?? "Unclassified diagnosis category";
}

/**
 * Shows an engineer the shape of a value without the value: enough to debug a
 * duplicate-row bug, not enough to learn what the patient takes.
 */
function technicalShape(value: string): string {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => `string(${line.length}) "${line.slice(0, 1)}${"•".repeat(Math.min(line.length - 1, 9))}"`)
    .join("\n");
}

export function applyTransform(
  value: string,
  transform: Transform,
  patient: Patient,
  now = new Date(),
): string {
  switch (transform) {
    case "pseudonymize":
      return patient.pseudonym;
    case "age_band":
      return ageBand(patient.dateOfBirth, now);
    case "category_only":
      return diagnosisCategory(value);
    case "coarse_date":
      return value.slice(0, 7);
    case "technical_shape":
      return technicalShape(value);
    case "none":
      return value;
  }
}

export const TRANSFORM_LABELS: Record<Transform, string> = {
  none: "Full value",
  pseudonymize: "Replaced with study pseudonym",
  age_band: "Reduced to a 5-year age band",
  category_only: "Reduced to diagnosis category",
  coarse_date: "Reduced to month precision",
  technical_shape: "Reduced to value shape only",
};
