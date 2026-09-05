export type DevelopmentDomain =
  | "communication"
  | "domestic"
  | "personalViews"
  | "finance"
  | "sexuality"
  | "psyche";
export type DevelopmentKind =
  "REFLECTION" | "SOLO_PRACTICE" | "PAIR_PRACTICE" | "TOPIC" | "LEISURE";
export type DevelopmentContent = Readonly<{
  key: string;
  revision: number;
  domain: DevelopmentDomain;
  kind: DevelopmentKind;
  title: string;
  purpose: string;
  durationMinutes: number;
  steps: readonly string[];
  prompts: readonly string[];
  conditions: string;
  outcome: string;
  reviewStatus: "DEMO_SELF_REFLECTION";
}>;
