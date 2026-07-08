import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id:              serial("id").primaryKey(),
  name:            text("name").notNull(),
  source:          text("source").notNull(),           // 'camera' | 'file'
  startedAt:       timestamp("started_at").defaultNow().notNull(),
  endedAt:         timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  pixelsPerMeter:  real("pixels_per_meter"),
  totalCars:        integer("total_cars").notNull().default(0),
  totalPedestrians: integer("total_pedestrians").notNull().default(0),
  totalBikes:       integer("total_bikes").notNull().default(0),
  totalMotorcycles: integer("total_motorcycles").notNull().default(0),
  totalTrucks:      integer("total_trucks").notNull().default(0),
  totalBuses:       integer("total_buses").notNull().default(0),
  avgSpeedKph:      real("avg_speed_kph"),
  maxSpeedKph:      real("max_speed_kph"),
  location:         text("location"),
  notes:            text("notes"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
