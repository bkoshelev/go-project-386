import React from "react";
import { createRoot } from "react-dom/client";
import { useActor } from "@xstate/react";
import { bookingMachineV6 } from "./booking";

const event = { id: "event-1", name: "Consultation", durationMinutes: 30 };
const selection = {
  event,
  slot: { startsAt: "2027-01-01T10:00:00Z", endsAt: "2027-01-01T10:30:00Z" },
};

function BookingExperiment() {
  const [snapshot, send] = useActor(bookingMachineV6);
  const { guest, errors, notice, confirmation } = snapshot.context;
  const saving = snapshot.matches("saving");
  return (
    <main>
      <h1>Эксперимент: бронирование</h1>
      {snapshot.matches("type") && (
        <button onClick={() => send({ type: "typeChosen", id: event.id })}>Выбрать тип</button>
      )}
      {snapshot.matches("time") && (
        <button onClick={() => send({ type: "slotChosen", selection })}>Выбрать время</button>
      )}
      {notice && <p role="alert">{notice}</p>}
      {(snapshot.matches("contacts") || saving) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "save" });
          }}
        >
          <label>
            Имя
            <input
              value={guest.name}
              disabled={saving}
              onChange={(e) => send({ type: "guestChanged", values: { name: e.target.value } })}
            />
          </label>
          {errors.name && <p role="alert">{errors.name}</p>}
          <label>
            Email
            <input
              value={guest.email}
              disabled={saving}
              onChange={(e) => send({ type: "guestChanged", values: { email: e.target.value } })}
            />
          </label>
          {errors.email && <p role="alert">{errors.email}</p>}
          <button disabled={saving}>Забронировать</button>
        </form>
      )}
      {snapshot.matches({ contacts: "unknown" }) && <p role="alert">Результат неизвестен</p>}
      {snapshot.matches({ contacts: "rejected" }) && <p role="alert">Запись отклонена</p>}
      {snapshot.matches("confirmed") && confirmation && (
        <output>Подтверждено: {confirmation.eventTypeName}</output>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<BookingExperiment />);
