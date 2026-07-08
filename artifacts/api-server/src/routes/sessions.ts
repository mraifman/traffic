import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, insertSessionSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  GetSessionParams,
  DeleteSessionParams,
  CreateSessionBody,
} from "@workspace/api-zod";

const router = Router();

// GET /api/sessions
router.get("/", async (req, res) => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.startedAt));
  res.json(sessions);
});

// POST /api/sessions
router.post("/", async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error });
  }
  const [session] = await db
    .insert(sessionsTable)
    .values(parsed.data)
    .returning();
  return res.status(201).json(session);
});

// GET /api/sessions/:id
router.get("/:id", async (req, res) => {
  const params = GetSessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id));
  if (!session) return res.status(404).json({ error: "Not found" });
  return res.json(session);
});

// DELETE /api/sessions/:id
router.delete("/:id", async (req, res) => {
  const params = DeleteSessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  return res.status(204).send();
});

export default router;
