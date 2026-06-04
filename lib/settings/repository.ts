import type { SqliteDatabase } from "@/lib/db/database";

export type AppSettings = {
  categories: string[];
  dailyCrawlTime: string;
  interestProfile: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  categories: ["cs.CL", "cs.AI", "cs.LG"],
  dailyCrawlTime: "08:00",
  interestProfile: "大语言模型后训练、模型推理、test-time scaling、RLHF/DPO/RLAIF、agentic RL、tool use、multi-agent reasoning"
};

export function createSettingsRepository(db: SqliteDatabase) {
  return new SettingsRepository(db);
}

class SettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<AppSettings> {
    const rows = this.db.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return {
      categories: parseJsonSetting(values.get("categories"), DEFAULT_SETTINGS.categories),
      dailyCrawlTime: values.get("dailyCrawlTime") ?? DEFAULT_SETTINGS.dailyCrawlTime,
      interestProfile: values.get("interestProfile") ?? DEFAULT_SETTINGS.interestProfile
    };
  }

  async update(input: AppSettings): Promise<AppSettings> {
    const now = new Date().toISOString();
    const entries = [
      ["categories", JSON.stringify(input.categories)],
      ["dailyCrawlTime", input.dailyCrawlTime],
      ["interestProfile", input.interestProfile]
    ] as const;

    for (const [key, value] of entries) {
      this.db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (@key, @value, @updatedAt)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run({ key, value, updatedAt: now });
    }

    return this.get();
  }

  async getInternalValue(key: string): Promise<string | null> {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = @key").get<{ value: string }>({ key });
    return row?.value ?? null;
  }

  async setInternalValue(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (@key, @value, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run({ key, value, updatedAt: now });
  }
}

function parseJsonSetting<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
