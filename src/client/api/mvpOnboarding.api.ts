import { http, type HttpRequestOptions } from './http';

export type MvpOnboardingCapturePolicy =
  | 'PRIVATE'
  | 'PAIR_MODEL_ONLY'
  | 'SHARED';

export type MvpOnboardingAnswerValue =
  | { kind: 'single'; optionId: string }
  | { kind: 'multi'; optionIds: string[] }
  | { kind: 'boolean'; booleanValue: boolean }
  | { kind: 'skipped' };

export type MvpOnboardingQuestionDTO = {
  id: string;
  revision: string;
  kind: 'single' | 'multi' | 'boolean';
  title: string;
  description: string;
  optional: boolean;
  sensitive: boolean;
  choices?: Array<{ id: string; label: string }>;
  minSelections?: number;
  maxSelections?: number;
  allowedCapturePolicies: MvpOnboardingCapturePolicy[];
};

export type MvpOnboardingResponseDTO = {
  definition: {
    contentRevision: string;
    policyVersion: string;
    questions: MvpOnboardingQuestionDTO[];
    capturePolicies: Array<{
      id: MvpOnboardingCapturePolicy;
      title: string;
      description: string;
    }>;
  };
  session: {
    status: 'in_progress' | 'completed';
    contentRevision: string;
    policyVersion: string;
    consent: {
      adultConfirmed: boolean;
      voluntaryParticipationConfirmed: boolean;
      privacyAcknowledged: boolean;
      confirmedAt: string;
    };
    cursor: number;
    answers: Array<{
      questionId: string;
      questionRevision: string;
      answerRevision: number;
      capturePolicy: MvpOnboardingCapturePolicy;
      value: MvpOnboardingAnswerValue;
      answeredAt: string;
    }>;
    startedAt: string;
    completedAt?: string;
    updatedAt: string;
  } | null;
};

export type MvpOnboardingMutationRequest =
  | {
      action: 'start';
      contentRevision: string;
      policyVersion: string;
      consent: {
        adultConfirmed: boolean;
        voluntaryParticipationConfirmed: boolean;
        privacyAcknowledged: boolean;
      };
    }
  | {
      action: 'answer';
      questionId: string;
      questionRevision: string;
      capturePolicy: MvpOnboardingCapturePolicy;
      value: MvpOnboardingAnswerValue;
    }
  | { action: 'complete' };

const noStore = (signal?: AbortSignal): HttpRequestOptions => ({
  ...(signal ? { signal } : {}),
  cache: 'no-store',
});

export const mvpOnboardingApi = {
  getOwnerState: (signal?: AbortSignal): Promise<MvpOnboardingResponseDTO> =>
    http.get<MvpOnboardingResponseDTO>(
      '/api/users/me/mvp-onboarding',
      noStore(signal)
    ),

  mutate: (
    payload: MvpOnboardingMutationRequest
  ): Promise<MvpOnboardingResponseDTO> =>
    http.patch<MvpOnboardingResponseDTO, MvpOnboardingMutationRequest>(
      '/api/users/me/mvp-onboarding',
      payload
    ),
};
