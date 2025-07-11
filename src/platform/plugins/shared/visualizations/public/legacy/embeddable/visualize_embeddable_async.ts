/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { VisualizeEmbeddable as VisualizeEmbeddableType } from './visualize_embeddable';

/** @deprecated
 * VisualizeEmbeddable is no longer registered with the legacy embeddable system and is only
 * used within the visualize editor.
 */
export const createVisualizeEmbeddableAsync = async (
  ...args: ConstructorParameters<typeof VisualizeEmbeddableType>
) => {
  // Build optimization. Move app styles from main bundle

  const { VisualizeEmbeddable } = await import('./visualize_embeddable');

  return new VisualizeEmbeddable(...args);
};
