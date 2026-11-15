import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getStorageSettings,
  runSecondaryBackup,
  updateStorageSettings,
  type StorageMode,
} from "../services/storage.js";

const updateSchema = z.object({
  mode: z.enum(["local_only", "local_replica", "hybrid", "online_primary"]).optional(),
  secondaryPath: z.string().min(1).max(1024).nullable().optional(),
  onlinePrimaryEnabled: z.boolean().optional(),
  onlineConnectionString: z.string().min(1).max(4096).nullable().optional(),
});

export async function storageRoutes(app: FastifyInstance) {
  app.get("/api/merchant/storage", async () => {
    return { storage: getStorageSettings() };
  });

  app.get("/api/merchant/storage/status", async () => {
    const storage = getStorageSettings();
    return {
      status: {
        mode: storage.mode,
        primary: {
          path: storage.primaryPath,
          exists: storage.primaryExists,
          sizeBytes: storage.primarySizeBytes,
        },
        secondary: {
          path: storage.secondaryPath,
          exists: storage.secondaryExists,
          sizeBytes: storage.secondarySizeBytes,
          lastBackupAt: storage.lastBackupAt,
          lastBackupError: storage.lastBackupError,
        },
        online: {
          enabled: storage.onlinePrimaryEnabled,
          connectionConfigured: storage.onlineConnectionConfigured,
          status: storage.onlinePrimaryStatus,
        },
        backupIntervalMs: storage.backupIntervalMs,
        conflictPolicy: storage.conflictPolicy,
        sliceNote: storage.sliceNote,
      },
    };
  });

  app.put("/api/merchant/storage", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const storage = updateStorageSettings({
        mode: parsed.data.mode as StorageMode | undefined,
        secondaryPath: parsed.data.secondaryPath,
        onlinePrimaryEnabled: parsed.data.onlinePrimaryEnabled,
        onlineConnectionString: parsed.data.onlineConnectionString,
      });
      return { storage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Cashier")) {
        return reply.code(403).send({ error: "forbidden", message });
      }
      return reply.code(400).send({ error: "update_failed", message });
    }
  });

  app.post("/api/merchant/storage/backup", async () => {
    const result = runSecondaryBackup();
    return { backup: result, storage: getStorageSettings() };
  });
}
