// Test conveniences bind real GET-issued intent to a specific fixture actor.
// Explicit negative tests send another actor's captured intent unchanged.
export type WithoutAssessmentIntent<T> = T extends object ? Omit<T, 'viewerToken' | 'intentToken' | 'context'> : never;
