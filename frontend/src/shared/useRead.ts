import { useCallback, useEffect, useState } from "react";

export type ReadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

export function useRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ReadState<T>>({ status: "loading" });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
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
  return { state, reload };
}
