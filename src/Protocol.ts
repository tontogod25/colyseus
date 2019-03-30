import msgpack from 'notepack.io';
import WebSocket from 'ws';
import { debugAndPrintError } from './Debug';
import { Client } from './index';
import { RoomAvailable } from './Room';

export const WS_CLOSE_CONSENTED = 4000;

// Colyseus protocol codes range between 0~100
// (msgpack messages are identified on client-side as >100)
export enum Protocol {

  // User-related (1~8)
  USER_ID = 1,

  // Room-related (9~19)
  JOIN_REQUEST = 9,
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

export const send = {
  [Protocol.USER_ID]: (client: Client) => {
    const buff = Buffer.allocUnsafe(1 + utf8Length(client.id));
    buff.writeUInt8(Protocol.USER_ID, 0);
    utf8Write(buff, 1, client.id);
    client.send(buff, { binary: true });
  },

  [Protocol.JOIN_ERROR]: (client: Client, message: string) => {
    const buff = Buffer.allocUnsafe(1 + utf8Length(message));
    buff.writeUInt8(Protocol.JOIN_ERROR, 0);
    utf8Write(buff, 1, message);
    client.send(buff, { binary: true });
  },

  [Protocol.JOIN_REQUEST]: (client: Client, requestId: number, roomId: string, processId: string) => {
    let offset = 0;

    /**
     * TODO: reset `requestId` to `0` on client-side once it reaches `127`
     */
    const roomIdLength = utf8Length(roomId);
    const processIdLength = utf8Length(processId);
    const buff = Buffer.allocUnsafe(1 + 1 + roomIdLength + processIdLength);

    buff.writeUInt8(Protocol.JOIN_REQUEST, offset++);
    buff.writeUInt8(requestId, offset++);
    utf8Write(buff, offset, roomId);
    offset += roomIdLength;

    utf8Write(buff, offset, processId);
    offset += processIdLength;

    client.send(buff, { binary: true });
  },

  [Protocol.JOIN_ROOM]: (client: Client, sessionId: string, serializerId: string, handshake?: number[]) => {
    let offset = 0;

    const sessionIdLength = utf8Length(sessionId);
    const serializerIdLength = utf8Length(serializerId);
    const handshakeLength = (handshake) ? handshake.length : 0;

    const buff = Buffer.allocUnsafe(1 + sessionIdLength + serializerIdLength + handshakeLength);
    buff.writeUInt8(Protocol.JOIN_ROOM, offset++);

    utf8Write(buff, offset, sessionId);
    offset += sessionIdLength;

    utf8Write(buff, offset, serializerId);
    offset += serializerIdLength;

    if (handshake) {
      for (let i = 0, l = handshake.length; i < l; i++) {
        buff.writeUInt8(handshake[i], offset++);
      }
    }

    client.send(buff, { binary: true });
  },

  [Protocol.ROOM_STATE]: (client: Client, bytes: number[]) => {
    /**
     * TODO: this is only supporting SchemaSerializer.
     * It should support FossilDeltaSerializer as well.
     */
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.alloc(1, Protocol.ROOM_STATE), { binary: true });
      client.send(bytes, { binary: true });
    }
  },

  [Protocol.ROOM_STATE_PATCH]: (client: Client, bytes: number[]) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.alloc(1, Protocol.ROOM_STATE_PATCH), { binary: true });
      client.send(bytes, { binary: true });
    }
  },

  [Protocol.ROOM_DATA]: (client: Client, data: any, encode: boolean = true) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.alloc(1, Protocol.ROOM_DATA), { binary: true });
      client.send(encode && msgpack.encode(data) || data, { binary: true });
    }
  },

  [Protocol.ROOM_LIST]: (client: Client, requestId: number, rooms: RoomAvailable[]) => {
    client.send(Buffer.alloc(1, Protocol.ROOM_LIST), { binary: true });
    client.send(msgpack.encode([requestId, rooms]), { binary: true });
  },

};

export function utf8Write(buff: Buffer, offset: number, str: string = '') {
  buff[offset++] = utf8Length(str) - 1;

  let c = 0;
  for (let i = 0, l = str.length; i < l; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) {
      buff[offset++] = c;
    } else if (c < 0x800) {
      buff[offset++] = 0xc0 | (c >> 6);
      buff[offset++] = 0x80 | (c & 0x3f);
    } else if (c < 0xd800 || c >= 0xe000) {
      buff[offset++] = 0xe0 | (c >> 12);
      buff[offset++] = 0x80 | (c >> 6) & 0x3f;
      buff[offset++] = 0x80 | (c & 0x3f);
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      buff[offset++] = 0xf0 | (c >> 18);
      buff[offset++] = 0x80 | (c >> 12) & 0x3f;
      buff[offset++] = 0x80 | (c >> 6) & 0x3f;
      buff[offset++] = 0x80 | (c & 0x3f);
    }
  }
}

// Faster for short strings than Buffer.byteLength
export function utf8Length(str: string = '') {
  let c = 0;
  let length = 0;
  for (let i = 0, l = str.length; i < l; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) {
      length += 1;
    } else if (c < 0x800) {
      length += 2;
    } else if (c < 0xd800 || c >= 0xe000) {
      length += 3;
    } else {
      i++;
      length += 4;
    }
  }
  return length + 1;
}
