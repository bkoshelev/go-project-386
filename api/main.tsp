import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Calendar Booking API" })
@info(#{ version: "0.0.0" })
namespace CalendarBooking;

/** Публичный профиль единственного заранее заданного владельца календаря. */
model CalendarOwnerProfile {
  fullName: string;
}

/**
 * Идентификаторы типов событий генерирует БД; клиенты используют UUID без интерпретации их
 * содержимого.
 */
@format("uuid")
scalar EventTypeId extends string;

/** Целое число минут, введённое в интерфейсе при выборе единицы «минуты». */
@minValue(1)
@maxValue(60)
scalar DurationUpToOneHour extends int32;

/**
 * Длительность в минутах после преобразования из 1–60 минут или 1–23 целых часов. Выбранная в
 * интерфейсе единица не сохраняется. Например, 2 часа преобразуются в 120 минут.
 */
union EventTypeDurationMinutes {
  minutes: DurationUpToOneHour,
  hours:
    | 120
    | 180
    | 240
    | 300
    | 360
    | 420
    | 480
    | 540
    | 600
    | 660
    | 720
    | 780
    | 840
    | 900
    | 960
    | 1020
    | 1080
    | 1140
    | 1200
    | 1260
    | 1320
    | 1380,
}

/**
 * Входные данные после удаления пробелов по краям названия; идентификатор типа события
 * генерирует БД.
 */
@extension("additionalProperties", false)
model CreateEventTypeRequest {
  @minLength(1)
  name: string;

  description?: string;
  durationMinutes: EventTypeDurationMinutes;
}

/** Тип события с UUID, сгенерированным БД, и длительностью, приведённой к минутам. */
model EventType {
  ...CreateEventTypeRequest;
  id: EventTypeId;
}

/** День недели в повторяющемся расписании доступности владельца. */
enum Weekday {
  monday,
  tuesday,
  wednesday,
  thursday,
  friday,
  saturday,
  sunday,
}

/** Местное время в часовом поясе расписания с точностью до минуты. */
@pattern("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
scalar LocalClockTime extends string;

/** Местное время окончания интервала; 24:00 обозначает конец местной календарной даты. */
@pattern("^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")
scalar LocalIntervalEndTime extends string;

/**
 * Интервал внутри одной местной календарной даты; начало должно быть раньше окончания.
 * Соприкасающиеся интервалы по обе стороны полуночи могут обеспечивать непрерывную доступность
 * для встречи.
 */
@extension("additionalProperties", false)
model AvailabilityTimeRange {
  start: LocalClockTime;
  end: LocalIntervalEndTime;
}

/**
 * Черновая настройка доступности дня недели; поддерживается несколько интервалов. Настройка
 * конкретной даты не может открыть заблокированный день недели. Блокировка сохраняет его
 * интервалы, разблокировка восстанавливает доступность по ним.
 */
@extension("additionalProperties", false)
model WeekdayAvailability {
  weekday: Weekday;
  isBlocked: boolean;
  intervals: AvailabilityTimeRange[];
}

/**
 * Повторяющиеся местные дни недели и интервалы в часовом поясе SchedulingSettings.timeZone.
 * Изначально все семь дней заблокированы, списки интервалов пусты. Владелец самостоятельно
 * открывает дни и задаёт интервалы. Поддержка сезонного перевода часов отложена до этапа после
 * MVP: https://github.com/bkoshelev/go-project-386/issues/32.
 */
@extension("additionalProperties", false)
model WeeklyAvailability {
  /** Ровно семь записей: каждый день недели указан один раз, с понедельника по воскресенье. */
  @minItems(7)
  @maxItems(7)
  days: WeekdayAvailability[];
}

/**
 * Интервалы конкретной местной даты в часовом поясе SchedulingSettings.timeZone. Явный флаг
 * блокировки не зависит от списка интервалов. Если день недели и дата не заблокированы,
 * собственные интервалы даты заменяют интервалы соответствующего дня недели. Дата не может
 * открыть заблокированный день недели. Блокировка очищает собственные интервалы даты; после
 * разблокировки используются недельные интервалы.
 */
model DateAvailability {
  date: plainDate;
  isBlocked: boolean;

  /**
   * Поле отсутствует, если собственные интервалы даты не заданы; используются недельные
   * интервалы.
   */
  intervals?: AvailabilityTimeRange[];
}

/** Общая пауза между встречами: от 0 до 60 целых минут включительно. */
@minValue(0)
@maxValue(60)
scalar MeetingPauseMinutes extends int32;

/**
 * Идентификатор часового пояса IANA, полученный из браузера владельца, а не постоянное числовое
 * смещение. Backend проверяет идентификатор. Поддержка сезонных переходов отложена до этапа
 * после MVP: https://github.com/bkoshelev/go-project-386/issues/32.
 */
@minLength(1)
scalar TimeZoneId extends string;

/** Общий часовой пояс расписания и пауза между встречами всех типов событий. */
model SchedulingSettings {
  /**
   * Первый определённый браузером часовой пояс владельца, сохранённый для календаря. В MVP не
   * меняется, в том числе после поездок и последующих сохранений расписания. Определяет все
   * недельные и датированные интервалы и блокировки дней.
   */
  timeZone?: TimeZoneId;

  /** Изначально 0 минут; владелец может изменить значение. */
  meetingPauseMinutes: MeetingPauseMinutes;
}

/** Первая успешная инициализация однократно сохраняет часовой пояс браузера владельца. */
@extension("additionalProperties", false)
model InitializeScheduleTimeZoneRequest {
  timeZone: TimeZoneId;
}

/** Обновление настроек не позволяет изменить сохранённый часовой пояс расписания в MVP. */
@extension("additionalProperties", false)
model UpdateSchedulingSettingsRequest {
  meetingPauseMinutes: MeetingPauseMinutes;
}

/** Тело запроса для замены настроек местной даты; сама дата передаётся в пути. */
@extension("additionalProperties", false)
model UpdateDateAvailabilityRequest {
  isBlocked: boolean;

  /**
   * Для наследования недельных интервалов поле нужно опустить. Явный пустой список означает
   * отсутствие рабочих часов. Блокировка даты очищает её сохранённые собственные интервалы
   * независимо от значения этого поля.
   */
  intervals?: AvailabilityTimeRange[];
}

/**
 * Обязательные данные гостя; бронирование не создаёт аккаунт. Перед проверкой и сохранением
 * удаляются пробелы по краям. Владение email не проверяется.
 */
@extension("additionalProperties", false)
model BookingGuest {
  @minLength(1)
  @maxLength(100)
  name: string;

  @format("email")
  @minLength(1)
  @maxLength(254)
  email: string;
}

/**
 * Черновые данные создания бронирования. Backend вычисляет окончание по длительности типа
 * события. Бронирование подтверждено после сохранения, согласие владельца не требуется.
 * Проверка доступности и создание выполняются атомарно: конкурирующие запросы не могут создать
 * пересекающиеся встречи или нарушить общую паузу. Каждая отправка, включая повторную, заново
 * проверяет доступность. Если предыдущая отправка сохранила бронирование, повтор сообщает о
 * занятом времени и не возвращает прежний успешный ответ.
 */
@extension("additionalProperties", false)
model CreateBookingRequest {
  eventTypeId: EventTypeId;

  /** Строго будущий момент времени с точностью до минуты, передаваемый в UTC. */
  startsAt: utcDateTime;

  guest: BookingGuest;
}

/** Идентификатор бронирования, генерируемый БД; клиент не интерпретирует его содержимое. */
@format("uuid")
scalar BookingId extends string;

/**
 * Результат успешного создания. Интерфейс показывает дату, начало и окончание в часовом поясе
 * пользователя с явной подписью пояса; моменты времени передаются в UTC. В MVP часовой пояс
 * пользователя автоматически определяет браузер.
 */
model BookingConfirmation {
  id: BookingId;
  status: "confirmed";
  eventTypeId: EventTypeId;
  eventTypeName: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

/**
 * Список встреч владельца включает имя и email гостя. Предстоящие встречи включают уже
 * начавшиеся: endsAt позже текущего момента. Результаты упорядочены по startsAt по возрастанию;
 * завершённые встречи исключены.
 */
model OwnerBooking extends BookingConfirmation {
  guest: BookingGuest;
}

/**
 * Полный список встреч с endsAt > now, упорядоченный по startsAt по возрастанию. Включает
 * текущие встречи; пагинации и скрытого ограничения количества записей нет.
 */
model OwnerBookings {
  /** Серверный момент времени, использованный для фильтра endsAt > now. */
  asOf: utcDateTime;

  items: OwnerBooking[];
}

/** Гость и владелец используют один каталог; пагинации нет. */
model EventTypes {
  items: EventType[];
}

/** Интервал встречи, заданный абсолютными моментами времени; время владельца не резервирует. */
model AvailableSlot {
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

/**
 * Снимок доступности для всех 14 дат UTC. Предлагаемые начала привязаны к :00/:15/:30/:45 UTC,
 * находятся строго в будущем и упорядочены по возрастанию; учитываются полная длительность
 * встречи и пауза. До инициализации расписания или при отсутствии доступного времени slots
 * пуст. Идентификаторы бронирований, данные гостей и сведения о других встречах гостю не
 * возвращаются.
 */
model EventAvailability {
  eventTypeId: EventTypeId;
  generatedAt: utcDateTime;

  /** Начало текущих календарных суток UTC по серверным часам; граница включена. */
  windowStartsAt: utcDateTime;

  /** Полночь после четырнадцатой даты UTC; граница не включена. */
  windowEndsAt: utcDateTime;

  slots: AvailableSlot[];
}

/** Причина недоступности начала встречи, заданного в корректном формате. */
enum UnavailabilityReason {
  time_occupied,
  starts_in_past,
  outside_booking_window,
  outside_working_hours,
  schedule_not_initialized,
}

/** Вручную можно задать любую целую минуту, в том числе вне сетки предложенных начал. */
@extension("additionalProperties", false)
model CheckAvailabilityRequest {
  startsAt: utcDateTime;
}

/**
 * Проверка доступности без записи прошла успешно; при создании доступность проверяется
 * повторно.
 */
model AvailableStart {
  available: true;
  slot: AvailableSlot;
}

/** Начало в корректном формате недоступно; сама проверка выполнена успешно. */
model UnavailableStart {
  available: false;
  reason: UnavailabilityReason;
}

/** Стабильный машинный код и понятное пользователю сообщение. */
model ErrorBody<Code extends string> {
  code: Code;
  message: string;
}

/** Поле задаётся указателем JSON Pointer в теле запроса либо именем параметра пути. */
model FieldIssue {
  field: string;
  code:
    | "required"
    | "invalid_format"
    | "out_of_range"
    | "invalid_interval"
    | "overlapping_intervals"
    | "duplicate_weekday"
    | "unknown_field";
  message: string;
}

/** JSON в корректном формате, не прошедший проверку входных данных или интервалов. */
model ValidationError extends ErrorBody<"validation_error"> {
  @minItems(1)
  fields: FieldIssue[];
}

/** Существующая встреча или обязательная пауза около неё конфликтует с новым интервалом. */
model BookingTimeOccupied {
  code: "time_occupied";
  message: "Время уже занято";
}

/** Доступность изменилась либо запрошенный интервал нарушает актуальные правила. */
model BookingTimeUnavailable extends ErrorBody<"time_unavailable"> {
  reason:
    | "starts_in_past"
    | "outside_booking_window"
    | "outside_working_hours"
    | "schedule_not_initialized";
}

/** Обёртка HTTP-ответа; в тело JSON сериализуется только содержимое payload. */
model HttpSuccess<Status, Payload> {
  @statusCode statusCode: Status;
  @body body: Payload;
}

/** Ошибки помечены явно, чтобы сгенерированные клиенты отделяли их от успешных данных. */
@error
model HttpFailure<Status, Payload> {
  @statusCode statusCode: Status;
  @body body: Payload;
}

alias BadRequest = HttpFailure<400, ErrorBody<"bad_request">>;
alias InvalidInput = HttpFailure<422, ValidationError>;
alias EventTypeNotFound = HttpFailure<404, ErrorBody<"event_type_not_found">>;
alias ScheduleNotInitialized = HttpFailure<
  409,
  ErrorBody<"schedule_not_initialized">
>;
alias ServerFailure = HttpFailure<500, ErrorBody<"internal_error">>;
alias ServiceUnavailable = HttpFailure<503, ErrorBody<"service_unavailable">>;
alias ReadFailure = ServerFailure | ServiceUnavailable;

/** Процесс запущен и может обслуживать HTTP-запросы. */
model HealthStatus {
  status: "ok";
}

/** Проверка работоспособности backend без обращения к внешним зависимостям. */
@route("/healthz")
@get
@operationId("getHealth")
op getHealth(): HealthStatus;

/** Единственный заранее заданный профиль с именем владельца для заголовка записи. */
@route("/api/owner")
@get
@operationId("getCalendarOwner")
op getCalendarOwner(): CalendarOwnerProfile | ReadFailure;

/** Возвращает все типы событий. Пустой каталог возвращается как успешный пустой список. */
@route("/api/event-types")
@get
@operationId("listEventTypes")
op listEventTypes(): EventTypes | ReadFailure;

/** Возвращает выбранный тип события для пошагового сценария бронирования. */
@route("/api/event-types/{eventTypeId}")
@get
@operationId("getEventType")
op getEventType(@path eventTypeId: EventTypeId):
  | EventType
  | BadRequest
  | EventTypeNotFound
  | ReadFailure;

/**
 * Возвращает предложенные слоты для полного скользящего окна из 14 дат UTC по серверным часам.
 * Ответ о доступности не резервирует время. Ответ должен содержать Cache-Control: no-store.
 */
@route("/api/event-types/{eventTypeId}/availability")
@get
@operationId("getEventAvailability")
op getEventAvailability(@path eventTypeId: EventTypeId):
  | EventAvailability
  | BadRequest
  | EventTypeNotFound
  | ReadFailure;

/**
 * Проверяет введённое вручную начало без записи по тем же правилам, что и создание. Секунды и
 * доли секунды должны быть нулевыми. Слот не резервируется.
 */
@route("/api/event-types/{eventTypeId}/availability/check")
@post
@operationId("checkEventAvailability")
op checkEventAvailability(
  @path eventTypeId: EventTypeId,
  @body request: CheckAvailabilityRequest,
):
  | AvailableStart
  | UnavailableStart
  | BadRequest
  | InvalidInput
  | EventTypeNotFound
  | ReadFailure;

/**
 * Атомарно проверяет полный интервал и паузу, затем сохраняет бронирование. Среди конфликтующих
 * запросов выигрывает первый успешно зафиксированный; повторы не возвращают прежний успех.
 * Ошибки полей дают 422, занятое время или изменившаяся доступность — 409.
 */
@route("/api/bookings")
@post
@operationId("createBooking")
op createBooking(@body request: CreateBookingRequest):
  | HttpSuccess<201, BookingConfirmation>
  | BadRequest
  | InvalidInput
  | EventTypeNotFound
  | HttpFailure<409, BookingTimeOccupied | BookingTimeUnavailable>
  | ReadFailure;

/** Создаёт тип события; UUID генерирует БД, одинаковые названия разрешены. */
@route("/api/admin/event-types")
@post
@operationId("createEventType")
op createEventType(@body request: CreateEventTypeRequest):
  | HttpSuccess<201, EventType>
  | BadRequest
  | InvalidInput
  | ReadFailure;

/** Возвращает все будущие и текущие встречи без пагинации. */
@route("/api/admin/bookings")
@get
@operationId("listOwnerBookings")
op listOwnerBookings(): OwnerBookings | ReadFailure;

/** До инициализации поле timeZone отсутствует, meetingPauseMinutes равно нулю. */
@route("/api/admin/scheduling-settings")
@get
@operationId("getSchedulingSettings")
op getSchedulingSettings(): SchedulingSettings | ReadFailure;

/**
 * Атомарно сохраняет первый корректный часовой пояс браузера владельца. Последующие вызовы
 * возвращают сохранённые настройки без изменения пояса, даже при передаче нового значения.
 * Часовой пояс гостя не используется для инициализации календаря.
 */
@route("/api/admin/scheduling-settings/time-zone")
@post
@operationId("initializeScheduleTimeZone")
op initializeScheduleTimeZone(
  @body request: InitializeScheduleTimeZoneRequest,
): SchedulingSettings | BadRequest | InvalidInput | ReadFailure;

/** Устанавливает общую паузу; попытка передать часовой пояс отклоняется как неизвестное поле. */
@route("/api/admin/scheduling-settings")
@put
@operationId("updateSchedulingSettings")
op updateSchedulingSettings(@body request: UpdateSchedulingSettingsRequest):
  | SchedulingSettings
  | BadRequest
  | InvalidInput
  | ReadFailure;

/** Изначально все семь дней недели заблокированы, списки интервалов пусты. */
@route("/api/admin/availability/weekly")
@get
@operationId("getWeeklyAvailability")
op getWeeklyAvailability(): WeeklyAvailability | ReadFailure;

/**
 * Атомарно заменяет настройки семи дней; каждый день недели должен быть указан ровно один раз.
 * Проверяются start < end и отсутствие пересечений; касание интервалов разрешено. Блокировка
 * дня сохраняет его интервалы; редактор передаёт их в запросе. Существующие бронирования
 * сохраняются. Часовой пояс должен быть инициализирован заранее.
 */
@route("/api/admin/availability/weekly")
@put
@operationId("updateWeeklyAvailability")
op updateWeeklyAvailability(@body request: WeeklyAvailability):
  | WeeklyAvailability
  | BadRequest
  | InvalidInput
  | ScheduleNotInitialized
  | ReadFailure;

/**
 * Возвращает явную настройку местной даты. Если её нет, возвращает дату, isBlocked: false и
 * отсутствие intervals, означающее наследование недельного шаблона. Ответ не отменяет
 * блокировку дня недели.
 */
@route("/api/admin/availability/dates/{date}")
@get
@operationId("getDateAvailability")
op getDateAvailability(@path date: plainDate):
  | DateAvailability
  | BadRequest
  | ScheduleNotInitialized
  | ReadFailure;

/**
 * Заменяет настройку местной даты. Блокировка очищает собственные интервалы даты. Для
 * разблокировки и наследования недельного шаблона передайте isBlocked: false без intervals.
 * Ответ содержит сохранённую настройку, а не объединённые рабочие часы. Блокировка дня недели
 * сохраняет приоритет. Существующие бронирования не меняются.
 */
@route("/api/admin/availability/dates/{date}")
@put
@operationId("updateDateAvailability")
op updateDateAvailability(
  @path date: plainDate,
  @body request: UpdateDateAvailabilityRequest,
):
  | DateAvailability
  | BadRequest
  | InvalidInput
  | ScheduleNotInitialized
  | ReadFailure;
