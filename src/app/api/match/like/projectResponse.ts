import { jsonOk, type JsonValue } from '@/lib/api/response';
import {
  LEGACY_MATCH_SCORE_AVAILABLE,
  LEGACY_MATCH_SCORE_SENTINEL,
} from '@/domain/matchScorePolicy';

type JsonObject = { [key: string]: JsonValue };

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const projectLegacyMatchLikeResponse = async (
  response: Response
): Promise<Response> => {
  if (!response.ok) return response;

  const envelope = await response
    .clone()
    .json()
    .catch(() => null) as JsonValue;
  if (!isJsonObject(envelope) || envelope.ok !== true || !isJsonObject(envelope.data)) {
    return response;
  }

  const id = typeof envelope.data.id === 'string' ? envelope.data.id : '';
  return jsonOk({
    id,
    matchScore: LEGACY_MATCH_SCORE_SENTINEL,
    matchScoreAvailable: LEGACY_MATCH_SCORE_AVAILABLE,
  });
};
