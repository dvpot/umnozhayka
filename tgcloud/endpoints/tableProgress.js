import { db, EndpointError } from 'sdk';
import { handleTableProgress } from '../lib/table-progress.js';

export default async function (input, ctx) {
  return handleTableProgress(db, input, ctx, EndpointError);
}
