import { createActor } from "xstate";
import { bookingMachineV6 } from "./booking";

const actor = createActor(bookingMachineV6);
actor.send({ type: "typeChosen", id: "event-1" });
// @ts-expect-error The event requires an id.
actor.send({ type: "typeChosen" });
// @ts-expect-error Unknown event names are rejected.
actor.send({ type: "misspelled" });
// @ts-expect-error The payload has the wrong type.
actor.send({ type: "typeChosen", id: 42 });
const snapshot = actor.getSnapshot();
if (snapshot.matches("confirmed")) {
  // @ts-expect-error This prototype has no state-specific confirmation type.
  const id: string = snapshot.context.confirmation.id;
  void id;
}
