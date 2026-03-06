import { IGithubCommit, IWeekGroup } from "../types";

export function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export function groupByWeek(commits: IGithubCommit[]): IWeekGroup[] {
  const map: Record<string, IWeekGroup> = {};
  for (const c of commits) {
    const key = getISOWeek(c.commit.author.date);
    if (!map[key]) {
      map[key] = {
        week: key,
        label: getWeekLabel(c.commit.author.date),
        commits: [],
      };
    }
    map[key].commits.push(c);
  }
  return Object.values(map).sort((a, b) => b.week.localeCompare(a.week));
}
