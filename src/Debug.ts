import debug from 'debug';
import { MatchMakeError } from './MatchMaker';

export const debugMatchMaking = debug('colyseus:matchmaking');
export const debugPatch = debug('colyseus:patch');
export const debugError = debug('colyseus:errors');

export const debugAndPrintError = (e: Error | string) => {
  let message = (e instanceof Error) ? e.stack : e;

  if (!(e instanceof MatchMakeError)) {
    console.error(message);
  }

  debugError.call(debugError, message);
};
