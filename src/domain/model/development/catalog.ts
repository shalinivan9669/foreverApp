import { createDevelopmentContentRepository } from "./publications";
import { DEVELOPMENT_CONTENT_V1, REFLECTION_OPTIONS_V1 } from "./published/v1";

export type {
  DevelopmentContent,
  DevelopmentDomain,
  DevelopmentKind,
} from "./content";
export {
  DEVELOPMENT_DOMAINS_V1 as DEVELOPMENT_DOMAINS,
  DEVELOPMENT_PROGRAMS_V1 as DEVELOPMENT_PROGRAMS,
  REFLECTION_OPTIONS_V1 as REFLECTION_OPTIONS,
} from "./published/v1";

/** Append new versions here while retaining every previously published revision. */
export const DEVELOPMENT_CONTENT_REPOSITORY =
  createDevelopmentContentRepository(
    DEVELOPMENT_CONTENT_V1.map((content) => ({
      content,
      responseOptions: REFLECTION_OPTIONS_V1,
    })),
  );
export const DEVELOPMENT_CATALOG = Object.freeze(
  DEVELOPMENT_CONTENT_REPOSITORY.listLatest().map(({ content }) => content),
);
export const findDevelopmentContent = (key: string) =>
  DEVELOPMENT_CONTENT_REPOSITORY.findLatest(key)?.content;
