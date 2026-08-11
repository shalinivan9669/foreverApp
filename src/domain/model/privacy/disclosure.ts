import type { FactorDefinition } from '@/domain/model/definitions/definitionTypes';
import type { PairFactorEvaluationSnapshot } from '@/domain/model/snapshots/snapshots';
import type {
  FactorAggregationStatus,
} from '@/domain/model/aggregation/factorAggregation';
import type { FactorValue } from '@/domain/model/values/factorValue';

export type DisclosureAudience =
  | 'SELF'
  | 'PARTNER'
  | 'MATCHING_ENGINE'
  | 'PUBLIC';

export type DisclosureConsent = {
  partnerDisclosure: boolean;
  matchingUse: boolean;
};

export type FactorDisclosureInput = {
  status: FactorAggregationStatus;
  value: FactorValue;
  confidence: number;
};

export type FactorDisclosure =
  | {
      disclosure: 'FULL';
      status: FactorAggregationStatus;
      value: FactorValue;
      confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
      reasonCode: 'SELF_ACCESS' | 'MATCHING_CONSENT';
    }
  | {
      disclosure: 'SUMMARY_ONLY';
      status: FactorAggregationStatus;
      confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
      reasonCode: 'PARTNER_SAFE_SUMMARY';
    }
  | {
      disclosure: 'WITHHELD';
      reasonCode:
        | 'PARTNER_CONSENT_REQUIRED'
        | 'MATCHING_CONSENT_REQUIRED'
        | 'PARTNER_DISCLOSURE_FORBIDDEN'
        | 'PUBLIC_DISCLOSURE_FORBIDDEN';
    };

const confidenceBand = (confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' =>
  confidence >= 0.75 ? 'HIGH' : confidence >= 0.4 ? 'MEDIUM' : 'LOW';

export function discloseFactor(
  definition: FactorDefinition,
  input: FactorDisclosureInput,
  audience: DisclosureAudience,
  consent: DisclosureConsent
): FactorDisclosure {
  if (audience === 'SELF') {
    return {
      disclosure: 'FULL',
      status: input.status,
      value: input.value,
      confidenceBand: confidenceBand(input.confidence),
      reasonCode: 'SELF_ACCESS',
    };
  }
  if (audience === 'PUBLIC') {
    return { disclosure: 'WITHHELD', reasonCode: 'PUBLIC_DISCLOSURE_FORBIDDEN' };
  }
  if (audience === 'MATCHING_ENGINE') {
    return consent.matchingUse
      ? {
          disclosure: 'FULL',
          status: input.status,
          value: input.value,
          confidenceBand: confidenceBand(input.confidence),
          reasonCode: 'MATCHING_CONSENT',
        }
      : { disclosure: 'WITHHELD', reasonCode: 'MATCHING_CONSENT_REQUIRED' };
  }
  if (!consent.partnerDisclosure) {
    return { disclosure: 'WITHHELD', reasonCode: 'PARTNER_CONSENT_REQUIRED' };
  }
  switch (definition.privacyClass) {
    case 'NORMAL':
      return {
        disclosure: 'SUMMARY_ONLY',
        status: input.status,
        confidenceBand: confidenceBand(input.confidence),
        reasonCode: 'PARTNER_SAFE_SUMMARY',
      };
    case 'PRIVATE':
      return {
        disclosure: 'SUMMARY_ONLY',
        status: input.status,
        confidenceBand: confidenceBand(input.confidence),
        reasonCode: 'PARTNER_SAFE_SUMMARY',
      };
    case 'SENSITIVE':
      return {
        disclosure: 'WITHHELD',
        reasonCode: 'PARTNER_DISCLOSURE_FORBIDDEN',
      };
    case 'MATCHING_ONLY':
      return {
        disclosure: 'WITHHELD',
        reasonCode: 'PARTNER_DISCLOSURE_FORBIDDEN',
      };
  }
}

export type PairEvaluationDisclosure =
  | {
      disclosure: 'SUMMARY_ONLY';
      factorKey: string;
      status: PairFactorEvaluationSnapshot['evaluation']['status'];
      confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
      actionability: PairFactorEvaluationSnapshot['evaluation']['actionability'];
      reasonCode: 'PAIR_EVALUATION_SAFE_SUMMARY';
    }
  | {
      disclosure: 'WITHHELD';
      reasonCode: 'PARTNER_CONSENT_REQUIRED' | 'PUBLIC_DISCLOSURE_FORBIDDEN';
    };

export function disclosePairEvaluation(
  snapshot: PairFactorEvaluationSnapshot,
  audience: 'PAIR_MEMBER' | 'PUBLIC',
  pairConsent: boolean
): PairEvaluationDisclosure {
  if (audience === 'PUBLIC') {
    return { disclosure: 'WITHHELD', reasonCode: 'PUBLIC_DISCLOSURE_FORBIDDEN' };
  }
  if (!pairConsent) {
    return { disclosure: 'WITHHELD', reasonCode: 'PARTNER_CONSENT_REQUIRED' };
  }
  return {
    disclosure: 'SUMMARY_ONLY',
    factorKey: snapshot.factorKey,
    status: snapshot.evaluation.status,
    confidenceBand: confidenceBand(snapshot.evaluation.confidence),
    actionability: snapshot.evaluation.actionability,
    reasonCode: 'PAIR_EVALUATION_SAFE_SUMMARY',
  };
}
