import type { VitalMetricKey } from "./types";

export const VITAL_COLLECTION_ORDER: VitalMetricKey[] = [
  "heart_rate",
  "spo2",
  "temp_c",
];

export const METRIC_LABELS: Record<VitalMetricKey, string> = {
  heart_rate: "Heart rate",
  spo2: "SpO₂",
  temp_c: "Temperature",
};

export const RECOMMENDED_COPY: Record<
  VitalMetricKey,
  { label: string; detail: string }
> = {
  heart_rate: {
    label: "Take heart rate",
    detail: "Current heart rate is needed to compare against personal baseline.",
  },
  spo2: {
    label: "Record SpO₂",
    detail: "Oxygen saturation helps rule out hypoxia-related symptoms.",
  },
  temp_c: {
    label: "Record temperature",
    detail: "Body temperature adds context for reported symptoms.",
  },
};

export const ENV_REVIEW = {
  label: "Review cabin environment",
  detail: "Compare spacecraft readings with reported symptoms (correlation only).",
};
