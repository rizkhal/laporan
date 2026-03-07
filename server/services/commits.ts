import { prisma } from "../config/db";

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(date);
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
  return { week: weekNum, year: d.getFullYear() };
}

export async function fetchAllCommits(
  owner: string,
  repo: string,
  branch: string,
  token: string,
) {
  let page = 1;
  const allCommits: any[] = [];
  const perPage = 100;

  const since = new Date();
  since.setMonth(since.getMonth() - 12);

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&since=${since.toISOString()}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
    const commits = await res.json();
    allCommits.push(...commits);

    if (commits.length < perPage) break;

    page++;
  }

  return allCommits;
}

export async function syncCommitsToDatabase(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  settingId: number,
) {
  // Fetch all commits from GitHub
  const commits = await fetchAllCommits(owner, repo, branch, token);

  // Transform and save to database
  for (const commit of commits) {
    const { week, year } = getISOWeek(commit.commit.author.date);

    await prisma.commit.upsert({
      where: { sha: commit.sha },
      update: {
        message: commit.commit.message,
        author: commit.commit.author.name,
        email: commit.commit.author.email || null,
        date: new Date(commit.commit.author.date),
        week,
        year,
        url: commit.html_url,
      },
      create: {
        id: commit.sha.substring(0, 12), // Use short SHA as id
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        email: commit.commit.author.email || null,
        date: new Date(commit.commit.author.date),
        week,
        year,
        url: commit.html_url,
        settingId,
      },
    });
  }

  return commits.length;
}
