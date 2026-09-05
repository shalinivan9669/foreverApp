import type { DevelopmentContent } from "./content";

/** The wording of both questions and answer options belongs to the pinned revision. */
export type PublishedDevelopmentContent = Readonly<{
  content: DevelopmentContent;
  responseOptions: readonly string[];
}>;

export type DevelopmentContentRepository = Readonly<{
  listLatest(): readonly PublishedDevelopmentContent[];
  findLatest(key: string): PublishedDevelopmentContent | undefined;
  findRevision(
    key: string,
    revision: number,
  ): PublishedDevelopmentContent | undefined;
}>;

/** Repository publication is append-only. A new repository models a new release. */
export function createDevelopmentContentRepository(
  publications: readonly PublishedDevelopmentContent[],
): DevelopmentContentRepository {
  const versions = new Map<string, Map<number, PublishedDevelopmentContent>>();
  const latest = new Map<string, PublishedDevelopmentContent>();
  for (const publication of publications) {
    const { content, responseOptions } = publication;
    if (
      !content.key ||
      !Number.isSafeInteger(content.revision) ||
      content.revision < 1
    )
      throw new Error("INVALID_DEVELOPMENT_PUBLICATION_IDENTITY");
    if (
      responseOptions.length !== 4 ||
      responseOptions.some((option) => !option.trim())
    )
      throw new Error("INVALID_DEVELOPMENT_RESPONSE_OPTIONS");
    const revisions =
      versions.get(content.key) ??
      new Map<number, PublishedDevelopmentContent>();
    if (revisions.has(content.revision))
      throw new Error("DUPLICATE_DEVELOPMENT_PUBLICATION");
    const immutable = Object.freeze({
      content: Object.freeze({
        ...content,
        steps: Object.freeze([...content.steps]),
        prompts: Object.freeze([...content.prompts]),
      }),
      responseOptions: Object.freeze([...responseOptions]),
    });
    revisions.set(content.revision, immutable);
    versions.set(content.key, revisions);
    const current = latest.get(content.key);
    if (!current || content.revision > current.content.revision)
      latest.set(content.key, immutable);
  }
  const publishedLatest = Object.freeze([...latest.values()]);
  return Object.freeze({
    listLatest: () => publishedLatest,
    findLatest: (key: string) => latest.get(key),
    findRevision: (key: string, revision: number) =>
      versions.get(key)?.get(revision),
  });
}
