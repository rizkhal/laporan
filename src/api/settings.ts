interface SettingsData {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

interface SettingsResponse extends SettingsData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSettings(): Promise<SettingsResponse | null> {
  const res = await fetch(`/api/settings`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error("Failed to fetch settings");
  }

  return res.json();
}

export async function saveSettings(
  data: SettingsData,
): Promise<SettingsResponse> {
  const res = await fetch(`/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to save settings");
  }

  return res.json();
}
