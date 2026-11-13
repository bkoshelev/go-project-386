import {
  getSchedulingSettings,
  updateSchedulingSettings,
  type SchedulingSettings,
} from "../../api/generated";

/** Проверяет текстовый ввод целой паузы 0–60 минут, не изменяя сам черновик. */
export function validPause(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) >= 0 && Number(value) <= 60;
}

function confirmedSettings(value: unknown): value is SchedulingSettings {
  return Boolean(
    value &&
    typeof value === "object" &&
    "meetingPauseMinutes" in value &&
    typeof value.meetingPauseMinutes === "number" &&
    Number.isInteger(value.meetingPauseMinutes) &&
    value.meetingPauseMinutes >= 0 &&
    value.meetingPauseMinutes <= 60,
  );
}

/** Читает подтверждённую сервером паузу; ошибка запроса или непригодный ответ отклоняет Promise. */
export async function readPause(signal: AbortSignal) {
  const result = await getSchedulingSettings({ signal, throwOnError: true });
  if (!confirmedSettings(result.data)) throw new Error("Invalid scheduling settings");
  return result.data.meetingPauseMinutes;
}

type SaveResult =
  | { kind: "saved"; minutes: number }
  | { kind: "rejected"; error?: string }
  | { kind: "unknown" };

/**
 * Сохраняет предварительно проверенную паузу без передачи часового пояса.
 * Различает подтверждение, отказ и неизвестный исход; запись автоматически не повторяет.
 */
export async function savePause(minutes: number, signal: AbortSignal): Promise<SaveResult> {
  try {
    const result = await updateSchedulingSettings({
      body: { meetingPauseMinutes: minutes },
      signal,
    });
    if (!result.response) return { kind: "unknown" };
    if (!result.response.ok)
      return {
        kind: "rejected",
        error:
          result.error?.code === "validation_error"
            ? result.error.fields.find((field) => field.field === "/meetingPauseMinutes")?.message
            : undefined,
      };
    if (
      result.response.status === 200 &&
      confirmedSettings(result.data) &&
      result.data.meetingPauseMinutes === minutes
    )
      return { kind: "saved", minutes: result.data.meetingPauseMinutes };
  } catch {
    return { kind: "unknown" };
  }
  return { kind: "unknown" };
}
