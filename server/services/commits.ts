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
