export function isAfterWorkHours(workEnd: string | null): boolean {
  if (!workEnd) return false;
  const [h, m] = workEnd.split(":").map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}
