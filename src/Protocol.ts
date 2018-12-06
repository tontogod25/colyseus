import * as msgpack from 'notepack.io';
import * as WebSocket from 'ws';
import { debugAndPrintError } from './Debug';
import { Client } from './index';

export const WS_CLOSE_CONSENTED = 4000;

// Use codes between 0~127 for lesser throughput (1 byte)
export enum Protocol {

  // User-related (1~9)
  USER_ID = 1,

  // Room-related (10~19)
  JOIN_ROOM = 10,
  JOIN_ERROR = 11,
  LEAVE_ROOM = 12,
  ROOM_DATA = 13,
  ROOM_STATE = 14,
  ROOM_STATE_PATCH = 15,

  // Match-making related (20~29)
  ROOM_LIST = 20,

  // Generic messages (50~60)
  BAD_REQUEST = 50,

  // WebSocket error codes
  WS_SERVER_DISCONNECT = 4201,
  WS_TOO_MANY_CLIENTS = 4202,
}

// Inter-process communication protocol
export enum IpcProtocol {
  SUCCESS = 0,
  ERROR = 1,
  TIMEOUT = 2,
}

export function decode(message: any) {
  try {
    message = msgpack.decode(Buffer.from(message));

  } catch (e) {
    debugAndPrintError(`message couldn't be decoded: ${message}\n${e.stack}`);
    return;
  }

  return message;
}

export function send(client: Client, message: any, encode: boolean = true) {
  if (client.readyState === WebSocket.OPEN) {
    client.send((encode && msgpack.encode(message)) || message, { binary: true });
  }
}
