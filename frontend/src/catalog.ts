import { useEffect, useState } from "react";
import { getCalendarOwner, listEventTypes } from "./api/generated";

export const readCatalog = async (signal: AbortSignal) =>
  (await listEventTypes({ signal, throwOnError: true })).data;

export const readOwner = async (signal: AbortSignal) =>
  (await getCalendarOwner({ signal, throwOnError: true })).data;

export function useRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; data: T }
  >({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    read(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [read, revision]);
  return { state, reload: () => setRevision((value) => value + 1) };
}
