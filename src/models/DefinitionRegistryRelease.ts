import mongoose, { Schema } from 'mongoose';
import type { DefinitionLifecycleStatus } from '@/domain/model/definitions/definitionTypes';

export type DefinitionRegistryManifest = {
  domainKeys: string[];
  dimensionKeys: string[];
  factorKeys: string[];
  measurementKeys: string[];
  instrumentKeys: string[];
  actionKeys: string[];
};

export type DefinitionRegistryCounts = {
  domains: number;
  dimensions: number;
  factors: number;
  measurements: number;
  instruments: number;
  actions: number;
};

export interface DefinitionRegistryReleaseType {
  registryKey: string;
  registryVersion: number;
  algorithmVersion: number;
  snapshotVersion: number;
  displayVersion: number;
  status: DefinitionLifecycleStatus;
  hash: string;
  canonicalRegistry: string;
  manifest: DefinitionRegistryManifest;
  counts: DefinitionRegistryCounts;
  publishedAt: Date;
  seededAt: Date;
}

const manifestSchema = new Schema<DefinitionRegistryManifest>(
  {
    domainKeys: { type: [String], required: true, immutable: true },
    dimensionKeys: { type: [String], required: true, immutable: true },
    factorKeys: { type: [String], required: true, immutable: true },
    measurementKeys: { type: [String], required: true, immutable: true },
    instrumentKeys: { type: [String], required: true, immutable: true },
    actionKeys: { type: [String], required: true, immutable: true },
  },
  { _id: false }
);

const countsSchema = new Schema<DefinitionRegistryCounts>(
  {
    domains: { type: Number, required: true, min: 0, immutable: true },
    dimensions: { type: Number, required: true, min: 0, immutable: true },
    factors: { type: Number, required: true, min: 0, immutable: true },
    measurements: { type: Number, required: true, min: 0, immutable: true },
    instruments: { type: Number, required: true, min: 0, immutable: true },
    actions: { type: Number, required: true, min: 0, immutable: true },
  },
  { _id: false }
);

const definitionRegistryReleaseSchema =
  new Schema<DefinitionRegistryReleaseType>(
    {
      registryKey: { type: String, required: true, immutable: true },
      registryVersion: { type: Number, required: true, min: 1, immutable: true },
      algorithmVersion: { type: Number, required: true, min: 1, immutable: true },
      snapshotVersion: { type: Number, required: true, min: 1, immutable: true },
      displayVersion: { type: Number, required: true, min: 1, immutable: true },
      status: {
        type: String,
        enum: ['DRAFT', 'PUBLISHED', 'RETIRED'],
        required: true,
        immutable: true,
      },
      hash: { type: String, required: true, immutable: true },
      canonicalRegistry: { type: String, required: true, immutable: true },
      manifest: { type: manifestSchema, required: true, immutable: true },
      counts: { type: countsSchema, required: true, immutable: true },
      publishedAt: { type: Date, required: true, immutable: true },
      seededAt: { type: Date, required: true, immutable: true },
    },
    { collection: 'factor_definition_registry_releases', versionKey: false }
  );

definitionRegistryReleaseSchema.index(
  { registryKey: 1, registryVersion: 1 },
  { unique: true }
);
definitionRegistryReleaseSchema.index({ hash: 1 }, { unique: true });
definitionRegistryReleaseSchema.index({ status: 1, registryVersion: -1 });

export const DefinitionRegistryRelease =
  (mongoose.models.DefinitionRegistryRelease as mongoose.Model<DefinitionRegistryReleaseType>) ||
  mongoose.model<DefinitionRegistryReleaseType>(
    'DefinitionRegistryRelease',
    definitionRegistryReleaseSchema
  );
