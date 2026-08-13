export type SaturdayRate = {
  throughMinute: number | null;
  amountPerMinute: number;
};

export const DEFAULT_SATURDAY_RATES: SaturdayRate[] = [
  { throughMinute: 10, amountPerMinute: 100 },
  { throughMinute: 20, amountPerMinute: 300 },
  { throughMinute: 30, amountPerMinute: 500 },
  { throughMinute: null, amountPerMinute: 1000 },
];

export const SUNDAY_LATE_FEE = 3000;
export const SUNDAY_ABSENT_FEE = 3000;

export function calculateSaturdayLateFee(
  lateMinutes: number,
  rates: SaturdayRate[] = DEFAULT_SATURDAY_RATES,
): number {
  if (!Number.isFinite(lateMinutes) || lateMinutes <= 0) return 0;

  const rate = rates.find(
    ({ throughMinute }) => throughMinute === null || lateMinutes <= throughMinute,
  );

  if (!rate) throw new Error("지각비 구간이 올바르지 않습니다.");
  return Math.floor(lateMinutes) * rate.amountPerMinute;
}

export function getLateMinutes(arrivedAt: Date, startHour = 10, startMinute = 30): number {
  const standardTime = new Date(arrivedAt);
  standardTime.setHours(startHour, startMinute, 0, 0);
  return Math.max(0, Math.floor((arrivedAt.getTime() - standardTime.getTime()) / 60_000));
}
