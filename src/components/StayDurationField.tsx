"use client";

import {
  DEFAULT_STAY_MINUTES,
  STAY_PRESETS,
  getStayMinutes,
} from "@/lib/timetable";
import type { Place } from "@/types/trip";
import { DurationMinutesField } from "./DurationMinutesField";

type StayDurationFieldProps = {
  id?: string;
  value?: Place["stayMinutes"];
  onChange: (minutes: number) => void;
};

export function StayDurationField({ id, value, onChange }: StayDurationFieldProps) {
  return (
    <DurationMinutesField
      id={id}
      value={getStayMinutes({ stayMinutes: value })}
      presets={STAY_PRESETS}
      fallback={DEFAULT_STAY_MINUTES}
      selectLabel="체류시간"
      inputLabel="체류시간 직접 입력(분)"
      onChange={onChange}
    />
  );
}
