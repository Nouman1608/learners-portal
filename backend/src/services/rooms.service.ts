import { db } from '../config/database';
import { rooms } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';

export interface CreateRoomInput {
  name: string;
  capacity: number;
}

export interface UpdateRoomInput {
  name?: string;
  capacity?: number;
  isActive?: boolean;
}

export const roomsService = {
  async createRoom(input: CreateRoomInput) {
    const [newRoom] = await db
      .insert(rooms)
      .values({
        name: input.name,
        capacity: input.capacity,
        isActive: true,
      })
      .returning();

    return newRoom;
  },

  async getRooms(activeOnly: boolean = false) {
    let query = db.select().from(rooms);

    if (activeOnly) {
      query = query.where(eq(rooms.isActive, true)) as any;
    }

    const allRooms = await query.orderBy(desc(rooms.createdAt));
    return allRooms;
  },

  async getRoomById(roomId: string) {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (!room) {
      throw new AppError(404, 'Room not found');
    }

    return room;
  },

  async updateRoom(roomId: string, input: UpdateRoomInput) {
    const existingRoom = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (existingRoom.length === 0) {
      throw new AppError(404, 'Room not found');
    }

    const [updatedRoom] = await db
      .update(rooms)
      .set(input)
      .where(eq(rooms.id, roomId))
      .returning();

    return updatedRoom;
  },

  async deleteRoom(roomId: string) {
    // Soft delete by deactivating
    await this.updateRoom(roomId, { isActive: false });
    return { message: 'Room deactivated successfully' };
  },
};

export default roomsService;
