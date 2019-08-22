import { SortOptions } from '../RegisteredHandler';

export interface RoomListingData {
  clients: number;
  locked: boolean;
  private: boolean;
  maxClients: number;
  metadata: any;
  name: string;
  processId: string;
  roomId: string;

  updateOne(operations: any);
  save();
  remove();
}

export interface QueryHelpers<T> {
  then: Promise<T>['then'];
  sort(options: SortOptions);
}

export interface MatchMakerDriver {
  createInstance(initialValues: any): RoomListingData;
  find(conditions: any, additionalProjectionFields?: any): Promise<RoomListingData[]> | RoomListingData[];
  findOne(conditions: any): QueryHelpers<RoomListingData>;
}
