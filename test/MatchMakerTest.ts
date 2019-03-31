(<any>process.env).COLYSEUS_PRESENCE_TIMEOUT = 50;

import assert from 'assert';
import sinon from 'sinon';

import { MatchMaker, REMOTE_ROOM_SHORT_TIMEOUT } from "../src/MatchMaker";
import { RegisteredHandler } from './../src/matchmaker/RegisteredHandler';
import { Room } from "../src/Room";

import { generateId, Protocol, isValidId } from "../src";
import { createDummyClient, DummyRoom, RoomVerifyClient, Client, RoomVerifyClientWithLock, RoomWithAsync } from "./utils/mock";
import { WS_CLOSE_CONSENTED } from '../src/Protocol';

process.on('unhandledRejection', (reason, promise) => {
  console.log(reason, promise);
});

describe('MatchMaker', function() {
  let matchMaker;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    matchMaker = new MatchMaker();

    matchMaker.registerHandler('room', DummyRoom);
    matchMaker.registerHandler('dummy_room', DummyRoom);
    matchMaker.registerHandler('room_with_default_options', DummyRoom, { level: 1 });
    matchMaker.registerHandler('room_verify_client', RoomVerifyClient);
    matchMaker.registerHandler('room_verify_client_with_lock', RoomVerifyClientWithLock);
    matchMaker.registerHandler('room_async', RoomWithAsync);

    clock = sinon.useFakeTimers();
  });

  afterEach(() => clock.restore());

  describe('room handlers', function() {
    it('should add handler with name', function() {
      assert.ok(matchMaker.hasHandler('room'));
    });

    it('should create a new room ', async () => {
      const { roomId } = await matchMaker.onJoinRoomRequest(createDummyClient(), 'room', {}, true);
      const room = matchMaker.getRoomById(roomId)
      assert.ok(typeof (room.roomId) === "string");
      assert.ok(room instanceof Room);
    });

    it('onInit should receive client options as second argument when creating room', function() {
      const onInitStub = sinon.stub(DummyRoom.prototype, 'onInit').returns(true);
      matchMaker.create('room_with_default_options', { map: "forest" });
      assert.deepEqual(onInitStub.getCall(0).args, [{ level: 1, map: "forest" }]);

      matchMaker.create('room_with_default_options', { level: 2 });
      assert.deepEqual(onInitStub.getCall(1).args, [{ level: 1 }], "shouldn't be possible to overwrite arguments");

      onInitStub.restore();
    });

    it('shouldn\'t return when trying to join with invalid room id', async () => {
      let { roomId } = await matchMaker.joinById('invalid_id', {});
      assert.equal(roomId, undefined);
    });

    it('shouldn\'t create room when requesting to join room with invalid params', async () => {
      const room = 'dummy_room';

      const joinRequestOptions = {
        invalid_param: 10,
      };

      try {
        await matchMaker.onJoinRoomRequest(createDummyClient(), room, joinRequestOptions);
        assert.fail("catch block should've taken place");
      } catch (e) {
        assert.equal(e.message, `Failed to auto-create room "${room}" during join request using options "${JSON.stringify(joinRequestOptions)}"`);
      }
    });

    it('shouldn\t return room instance when trying to join existing room by id with invalid params', async () => {
      clock.restore();

      let { roomId } = await matchMaker.onJoinRoomRequest(createDummyClient(), 'room', {});
      assert.ok(isValidId(roomId));

      let { joinByRoomId } = await matchMaker.joinById(roomId, { invalid_param: 1 });
      assert.equal(joinByRoomId, undefined);
    });

    it('should join existing room using "joinById"', async () => {
      clock.restore();

      const client = createDummyClient();
      let { roomId } = await matchMaker.onJoinRoomRequest(client, 'room', {});
      assert.ok(isValidId(roomId));

      let [_, joinByRoomId] = await matchMaker.joinById(roomId, {});
      assert.ok(isValidId(joinByRoomId));

      const roomClient = createDummyClient();
      await matchMaker.onJoinRoomRequest(roomClient, roomId, {});
      await matchMaker.connectToRoom(roomClient, roomId);
      assert.ok(roomClient.sessionId, "should have valid sessionId");
    });

    it('should call "onDispose" when room is not created', async () => {
      const stub = sinon.stub(DummyRoom.prototype, 'requestJoin').returns(false);
      const spy = sinon.spy(DummyRoom.prototype, 'onDispose');
      try {
        await matchMaker.create('dummy_room', {});
        assert.fail("catch block should've taken place");

      } catch (e) {
        assert.equal(typeof(e.message), "string");
        assert.ok(spy.calledOnce);
        stub.restore();
        spy.restore();
      }
    });

    it('should emit error if room name is not a valid id', async () => {
      const invalidRoomName = 'fjf10jf10jf0jf0fj';
      try {
        await matchMaker.onJoinRoomRequest(createDummyClient(), invalidRoomName, {});

      } catch (e) {
        assert.equal(e.message, `Failed to join invalid room "${invalidRoomName}"`);
      }
    });

  });

  describe('onJoin', () => {
    it('should send error message to client when joining invalid room', async () => {

      let client = createDummyClient({});
      clock.restore();

      try {
        await matchMaker.connectToRoom(client, generateId());
        assert.fail("an error should be thrown here.");

      } catch (e) {
        assert.ok(e.message.match(/room doesn't exist/));
      }
    });
  });

  // describe('verifyClient', () => {
  //   it('should\'t allow to connect when verifyClient returns false', (done) => {
  //     let client = createDummyClient();

  //     RoomVerifyClient.prototype.verifyClient = () => false;

  //     matchMaker.onJoinRoomRequest('room_verify_client', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         throw new Error("this promise shouldn't succeed");

  //       }).catch(err => {
  //         assert.ok(typeof (err) === "string");
  //         assert.equal(client.lastMessage[0], Protocol.JOIN_ERROR);
  //         done();
  //       });
  //     });
  //   });

  //   it('should\'t allow to connect when verifyClient returns a failed promise', (done) => {
  //     let client = createDummyClient();

  //     RoomVerifyClient.prototype.verifyClient = () => new Promise((resolve, reject) => {
  //       setTimeout(() => reject("forbidden"), 50);
  //     });

  //     matchMaker.onJoinRoomRequest('room_verify_client', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         throw new Error("this promise shouldn't succeed");

  //       }).catch(err => {
  //         assert.equal(err, "forbidden");
  //         assert.equal(client.lastMessage[0], Protocol.JOIN_ERROR);
  //         done();
  //       });
  //     });
  //   });

  //   it('should allow to connect when verifyClient returns true', (done) => {
  //     let client = createDummyClient();

  //     RoomVerifyClient.prototype.verifyClient = () => true;

  //     matchMaker.onJoinRoomRequest('room_verify_client', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         assert.ok(room instanceof Room);
  //         done();

  //       }).catch(err => {
  //         throw new Error(err);
  //       });
  //     });
  //   });

  //   it('should allow to connect when verifyClient returns fulfiled promise', (done) => {
  //     let client = createDummyClient();

  //     RoomVerifyClient.prototype.verifyClient = () => new Promise((resolve, reject) => {
  //       setTimeout(() => resolve(), 50);
  //     });

  //     matchMaker.onJoinRoomRequest('room_verify_client', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         assert.equal(1, room.clients.length);
  //         assert.ok(room instanceof Room);
  //         done();

  //       }).catch(err => {
  //         throw new Error(err);
  //       });
  //     });
  //   });

  //   it('should handle leaving room before onJoin is fulfiled.', (done) => {
  //     const onDisposeSpy = sinon.spy(RoomVerifyClient.prototype, 'onDispose');

  //     RoomVerifyClient.prototype.verifyClient = () => new Promise((resolve, reject) => {
  //       setTimeout(() => resolve(), 100);
  //     });

  //     let client = createDummyClient();

  //     matchMaker.onJoinRoomRequest('room_verify_client', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         throw new Error("this promise shouldn't succeed");

  //       }).catch(err => {
  //         assert.equal(0, room.clients.length);
  //         assert.deepEqual({}, matchMaker.sessions);
  //         assert.ok(onDisposeSpy.calledOnce);
  //         onDisposeSpy.restore();

  //         done();
  //       });

  //       client.emit('close');
  //     });
  //   });

  //   xit('shouldn\'t accept second client when room is locked after first one', (done) => {
  //     let client = createDummyClient();

  //     matchMaker.onJoinRoomRequest('room_verify_client_with_lock', { clientId: client.id }, true, (err, room) => {
  //       matchMaker.bindClient(client, room.roomId).then((room) => {
  //         assert.equal(1, room.clients.length);
  //         assert.ok(room instanceof Room);

  //       }).catch(err => {
  //         throw new Error("this promise shouldn't fail");
  //       });
  //     });

  //     // try to join with a second client when the room will be locked
  //     setTimeout(() => {
  //       let client = createDummyClient();
  //       matchMaker.onJoinRoomRequest('room_verify_client_with_lock', { clientId: client.id }, true, (err, room) => {
  //         matchMaker.bindClient(client, room.roomId).then((room) => {
  //           assert.equal(1, room.clients.length);
  //           assert.ok(room instanceof Room);
  //           done();

  //         }).catch(err => {
  //           throw new Error("this promise shouldn't fail");
  //         });
  //       });
  //     }, 10);

  //   });
  // });

  describe('registered handler events', () => {
    it('should trigger "create" event', (done) => {
      matchMaker.handlers["room"].on("create", (room) => {
        assert.ok(room instanceof Room);
        done();
      });

      matchMaker.create('room', {});
    });

    it('should trigger "dispose" event', async () => {
      let dummyRoom = matchMaker.getRoomById(await matchMaker.create('room', {}));

      matchMaker.handlers["room"].on("dispose", (room) => {
        assert.ok(room instanceof Room);
      });

      dummyRoom.emit("dispose");
    });

    it('should trigger "join" event', (done) => {
      let dummyRoom = matchMaker.getRoomById(matchMaker.create('room', {}));

      // TODO

      matchMaker.handlers["room"].on("join", (room, client) => {
        assert.ok(room instanceof Room);
        assert.ok(client instanceof Client);
        done();
      });

      let client = createDummyClient();

      matchMaker.onJoinRoomRequest(client, 'room', {}).then(({ roomId }) => {
        matchMaker.getRoomById(roomId)._onJoin(client, {});
      })
    });

    it('should trigger "lock" event', (done) => {
      matchMaker.handlers["room"].on("lock", (room) => done());
      matchMaker.handlers["room"].on("create", (room) => room.lock());
      matchMaker.create('room', {});
    });

    it('should trigger "unlock" event', (done) => {
      matchMaker.handlers["room"].on("unlock", (room) => done());
      matchMaker.handlers["room"].on("create", (room) => {
        room.lock();
        room.unlock();
      });
      matchMaker.create('room', {});
    });

    it('should\'nt trigger "unlock" if room hasn\'t been locked before', (done) => {
      clock.restore();

      matchMaker.handlers["room"].on("unlock", (room) => {
        throw new Error("shouldn't trigger 'unlock' event here");
      });
      matchMaker.handlers["room"].on("create", (room) => room.unlock());
      setTimeout(() => done(), 100);
      matchMaker.create('room', {});
    });

    it('should trigger "leave" event',  (done) => {
      let dummyRoom = matchMaker.getRoomById(matchMaker.create('room', {}));

      matchMaker.handlers["room"].on("leave", (room, client) => {
        assert.ok(room instanceof Room);
        assert.ok(client instanceof Client);
        done();
      });

      let client = createDummyClient();

      matchMaker.onJoinRoomRequest(client, 'room', { clientId: client.id }).then(({ roomId }) => {
        let room = matchMaker.getRoomById(roomId);
        room._onJoin(client);
        room._onLeave(client);
      });
    });
  });

  describe("async callbacks", () => {
    it("shouldn't allow to join a room that's disposing asynchronously", async () => {
      const tick = async (ms) => clock.tick(ms);

      const client = createDummyClient({});
      const { roomId } = await matchMaker.onJoinRoomRequest(client, 'room_async', {});
      const room = matchMaker.getRoomById(roomId);

      await tick(room.seatReservationTime * 1000 - 1);
      assert(matchMaker.getRoomById(roomId) instanceof Room);

      await matchMaker.connectToRoom(client, roomId);
      await tick(room.seatReservationTime * 1000);
      assert(matchMaker.getRoomById(roomId) instanceof Room);

      client.close(WS_CLOSE_CONSENTED);
      await tick(RoomWithAsync.ASYNC_TIMEOUT + 1);
      await tick(RoomWithAsync.ASYNC_TIMEOUT + 1);

      // WORKAROUND: each tick fulfils an internal promise
      await tick(1);
      await tick(1);
      await tick(1);

      assert(!matchMaker.getRoomById(roomId));
    });
  });

  describe("time between room creation and first connection", () => {
    it('should remove the room reference after a timeout without connection', async () => {
      const { roomId } = await matchMaker.onJoinRoomRequest(createDummyClient(), 'room', {});
      const dummyRoom = matchMaker.getRoomById(roomId);
      assert.equal(dummyRoom.clients, 0);
      assert(dummyRoom instanceof Room);

      clock.tick(dummyRoom.seatReservationTime * 1000);
      assert(matchMaker.getRoomById(roomId) === undefined);
    });

    it('timer should be re-set if second client tries to join the room', async () => {
      const { roomId } = await matchMaker.onJoinRoomRequest(createDummyClient(), 'room', {});
      const room = matchMaker.getRoomById(roomId);
      clock.tick(room.seatReservationTime * 1000 - 1);
      assert(room instanceof Room);

      await matchMaker.onJoinRoomRequest(createDummyClient(), 'room', {});
      assert(matchMaker.getRoomById(roomId) instanceof Room);

      clock.tick(room.seatReservationTime * 1000);
      assert(matchMaker.getRoomById(roomId) === undefined);
    });

    it('room shouldn\'t be removed if a client has joined', async () => {
      const client = createDummyClient({});
      const { roomId } = await matchMaker.onJoinRoomRequest(client, 'room', {});
      const room = matchMaker.getRoomById(roomId);

      clock.tick(room.seatReservationTime * 1000 - 1);
      assert(room instanceof Room);

      await matchMaker.connectToRoom(client, roomId);
      clock.tick(room.seatReservationTime * 1000);
      assert(matchMaker.getRoomById(roomId) instanceof Room);
    });
  });

});
