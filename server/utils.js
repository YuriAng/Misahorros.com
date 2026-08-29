// Server-side id generation, mirroring src/utils.js's `generateId` so ids
// stay in the same `prefix_hex8` shape whether created by the client
// (legacy import payloads) or by the API itself.
import { randomUUID } from 'node:crypto';

export function generateId(prefix = 'id') {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
