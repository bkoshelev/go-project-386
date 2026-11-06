import { Button, Stack, TextInput } from "@mantine/core";
import { useLayoutEffect, useRef } from "react";
import type { AvailabilityTimeRange } from "../../api/generated";

type Props = {
  intervals: AvailabilityTimeRange[];
  errors: Record<string, string>;
  prefix: string;
  date?: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, values: Partial<AvailabilityTimeRange>) => void;
};

export function IntervalEditor({
  intervals,
  errors,
  prefix,
  date,
  onAdd,
  onRemove,
  onChange,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | "add" | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const selector =
      pendingFocus.current === "add"
        ? "[data-add-interval]"
        : `[data-interval-start="${pendingFocus.current}"]`;
    root.current?.querySelector<HTMLElement>(selector)?.focus();
    pendingFocus.current = null;
  }, [intervals]);
  return (
    <Stack ref={root} gap="sm">
      {intervals.map((interval, index) => (
        <div className="availability-interval" key={index}>
          <TextInput
            label={`Начало интервала ${index + 1}`}
            placeholder="09:00"
            value={interval.start}
            data-interval-start={index}
            error={errors[`${prefix}/${index}/start`]}
            maxLength={5}
            onChange={(event) => onChange(index, { start: event.currentTarget.value })}
          />
          <TextInput
            label={`Окончание интервала ${index + 1}`}
            placeholder="18:00"
            value={interval.end}
            error={errors[`${prefix}/${index}/end`]}
            maxLength={5}
            onChange={(event) => onChange(index, { end: event.currentTarget.value })}
          />
          <Button
            variant="subtle"
            className="availability-remove"
            aria-label={`Удалить интервал${date ? " даты" : ""} ${index + 1}`}
            onClick={() => {
              pendingFocus.current =
                intervals.length === 1 ? "add" : Math.min(index, intervals.length - 2);
              onRemove(index);
            }}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        variant="light"
        data-add-interval
        onClick={() => {
          pendingFocus.current = intervals.length;
          onAdd();
        }}
      >
        {date ? "Добавить интервал даты" : "Добавить интервал"}
      </Button>
    </Stack>
  );
}
