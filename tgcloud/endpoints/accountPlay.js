import { db, EndpointError } from 'sdk';
import { handleAccountPlay } from '../lib/account-play.js';

export default async function (input, ctx) {
  return handleAccountPlay(db, input, ctx, EndpointError);
}
