/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { extname } from 'path';
import { Readable } from 'stream';
import { chain } from 'lodash';
import { schema } from '@kbn/config-schema';
import type { SavedObjectConfig } from '@kbn/core-saved-objects-base-server-internal';
import { SavedObjectsImportError } from '@kbn/core-saved-objects-import-export-server-internal';
import type { InternalCoreUsageDataSetup } from '@kbn/core-usage-data-base-server-internal';
import type { InternalSavedObjectRouter } from '../internal_types';
import { catchAndReturnBoomErrors, createSavedObjectsStreamFromNdJson } from './utils';

interface RouteDependencies {
  config: SavedObjectConfig;
  coreUsageData: InternalCoreUsageDataSetup;
}

interface FileStream extends Readable {
  hapi: {
    filename: string;
  };
}

export const registerResolveImportErrorsRoute = (
  router: InternalSavedObjectRouter,
  { config, coreUsageData }: RouteDependencies
) => {
  const { maxImportPayloadBytes } = config;

  router.post(
    {
      path: '/_resolve_import_errors',
      options: {
        summary: `Resolve import errors`,
        tags: ['oas-tag:saved objects'],
        access: 'public',
        description:
          'To resolve errors from the import objects API, you can retry certain saved objects, overwrite specific saved objects, and change references to different saved objects',
        body: {
          maxBytes: maxImportPayloadBytes,
          output: 'stream',
          accepts: 'multipart/form-data',
        },
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the Saved Objects Client',
        },
      },
      validate: {
        query: schema.object(
          {
            createNewCopies: schema.boolean({ defaultValue: false }),
            compatibilityMode: schema.boolean({ defaultValue: false }),
          },
          {
            validate: (object) => {
              if (object.createNewCopies && object.compatibilityMode) {
                return 'cannot use [createNewCopies] with [compatibilityMode]';
              }
            },
          }
        ),
        body: schema.object({
          file: schema.stream(),
          retries: schema.arrayOf(
            schema.object({
              type: schema.string(),
              id: schema.string(),
              overwrite: schema.boolean({ defaultValue: false }),
              destinationId: schema.maybe(schema.string()),
              replaceReferences: schema.arrayOf(
                schema.object({
                  type: schema.string(),
                  from: schema.string(),
                  to: schema.string(),
                }),
                { defaultValue: [] }
              ),
              createNewCopy: schema.maybe(schema.boolean()),
              ignoreMissingReferences: schema.maybe(schema.boolean()),
            })
          ),
        }),
      },
    },
    catchAndReturnBoomErrors(async (context, req, res) => {
      const { createNewCopies, compatibilityMode } = req.query;

      const usageStatsClient = coreUsageData.getClient();
      usageStatsClient
        .incrementSavedObjectsResolveImportErrors({
          request: req,
          createNewCopies,
          compatibilityMode,
        })
        .catch(() => {});

      const file = req.body.file as FileStream;
      const fileExtension = extname(file.hapi.filename).toLowerCase();
      if (fileExtension !== '.ndjson') {
        return res.badRequest({ body: `Invalid file extension ${fileExtension}` });
      }

      let readStream: Readable;
      try {
        readStream = await createSavedObjectsStreamFromNdJson(file);
      } catch (e) {
        return res.badRequest({
          body: e,
        });
      }

      const { getClient, getImporter, typeRegistry } = (await context.core).savedObjects;

      const includedHiddenTypes = chain(req.body.retries)
        .map('type')
        .uniq()
        .filter(
          (type) => typeRegistry.isHidden(type) && typeRegistry.isImportableAndExportable(type)
        )
        .value();

      const client = getClient({ includedHiddenTypes });
      const importer = getImporter(client);

      try {
        const result = await importer.resolveImportErrors({
          readStream,
          retries: req.body.retries,
          createNewCopies,
          compatibilityMode,
        });

        return res.ok({ body: result });
      } catch (e) {
        if (e instanceof SavedObjectsImportError) {
          return res.badRequest({
            body: {
              message: e.message,
              attributes: e.attributes,
            },
          });
        }
        throw e;
      }
    })
  );
};
