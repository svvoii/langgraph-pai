import { randomUUID } from "node:crypto";

function getHumanDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  return `${day}${month}${year}`;
}

export function createWorkId(): string {
  return `work-${getHumanDate()}-${randomUUID().slice(0, 8)}`;
}
