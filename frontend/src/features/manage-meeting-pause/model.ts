import { assign, fromPromise, setup } from "xstate";
import { readPause, savePause, validPause } from "./workflows";

/**
 * Управляет чтением общей паузы и её редактированием в диалоге.
 * Запросы выполняют actors; черновик и неизвестный исход сохраняются при закрытии.
 * Повторная запись возможна только по явному действию пользователя.
 */
export const meetingPauseMachine = setup({
  types: {
    context: {} as {
      /** Последнее подтверждённое сервером значение; null означает, что успешного чтения ещё не было. */
      confirmed: number | null;
      /** Текст поля без преобразования в число, чтобы сохранять пустой и неверный ввод. */
      draft: string;
      /** Локальная или серверная ошибка поля, сохраняемая до изменения ввода или новой записи. */
      error?: string;
      /** Результат записи неизвестен; флаг снимается только после подтверждённого сохранения. */
      outcomeUnknown: boolean;
    },
    events: {} as
      /** Открыть диалог с сохранённым в памяти черновиком. */
      | { type: "open" }
      /** Закрыть диалог, сохранив ввод; во время записи событие игнорируется. */
      | { type: "close" }
      /** Проверить черновик и при корректном значении начать сохранение. */
      | { type: "save" }
      /** Вручную повторить неуспешное чтение настройки. */
      | { type: "retry" }
      /** Обновить текст поля и убрать прежнюю ошибку валидации. */
      | { type: "change"; value: string },
  },
  actors: {
    read: fromPromise(({ signal }: { signal: AbortSignal }) => readPause(signal)),
    save: fromPromise(({ input, signal }: { input: number; signal: AbortSignal }) =>
      savePause(input, signal),
    ),
  },
}).createMachine({
  id: "meetingPause",
  initial: "loading",
  context: { confirmed: null, draft: "", outcomeUnknown: false },
  states: {
    /** Читает настройку; значение 0 показывается как данные только после успешного ответа. */
    loading: {
      invoke: {
        src: "read",
        onDone: {
          target: "closed",
          actions: assign({
            confirmed: ({ event }) => event.output,
            draft: ({ event }) => String(event.output),
          }),
        },
        onError: "loadFailed",
      },
    },
    /** Чтение завершилось ошибкой; новое чтение запускается только вручную. */
    loadFailed: { on: { retry: "loading" } },
    /** Диалог закрыт; подтверждённое значение, черновик и неизвестный исход остаются в контексте. */
    closed: { on: { open: "editing" } },
    /** Диалог открыт: доступны изменение ввода, закрытие и явное сохранение. */
    editing: {
      initial: "idle",
      on: {
        change: {
          target: ".idle",
          actions: assign({ draft: ({ event }) => event.value, error: undefined }),
        },
        close: "closed",
        save: "validating",
      },
      states: {
        /** Обычный ввод при открытии диалога или после изменения поля. */
        idle: {},
        /** Локальная проверка отклонила ввод; запрос не отправлен, поле получает фокус. */
        invalid: {},
        /** Сервер отклонил запись; черновик остаётся доступен для исправления и повтора. */
        rejected: {},
        /** Ответ не подтвердил результат записи; черновик сохранён, автоматического повтора нет. */
        unknown: {},
      },
    },
    /** Проверяет целое значение 0–60 перед запросом и выбирает сохранение либо ошибку поля. */
    validating: {
      always: [
        {
          guard: ({ context }) => !validPause(context.draft),
          target: "editing.invalid",
          actions: assign({ error: "Введите целое число от 0 до 60" }),
        },
        { target: "saving", actions: assign({ error: undefined }) },
      ],
    },
    /** Выполняет запись; закрытие, редактирование и повторная отправка не имеют переходов. */
    saving: {
      invoke: {
        src: "save",
        input: ({ context }) => Number(context.draft),
        onDone: [
          {
            guard: ({ event }) => event.output.kind === "saved",
            target: "saved",
            actions: assign({
              confirmed: ({ context, event }) =>
                event.output.kind === "saved" ? event.output.minutes : context.confirmed,
              draft: ({ context, event }) =>
                event.output.kind === "saved" ? String(event.output.minutes) : context.draft,
              outcomeUnknown: false,
            }),
          },
          {
            guard: ({ event }) => event.output.kind === "rejected",
            target: "editing.rejected",
            actions: assign({
              error: ({ event }) =>
                event.output.kind === "rejected" ? event.output.error : undefined,
            }),
          },
          { target: "editing.unknown", actions: assign({ outcomeUnknown: true }) },
        ],
        onError: { target: "editing.unknown", actions: assign({ outcomeUnknown: true }) },
      },
    },
    /** Сервер подтвердил сохранение: диалог закрыт, показаны фактическое значение и сообщение успеха. */
    saved: { on: { open: "editing" } },
  },
});
