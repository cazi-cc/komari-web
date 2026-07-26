import React from "react";

export interface AgentDistribution {
  repository: string;
  script_ref: string;
  linux_script_url: string;
  windows_script_url: string;
  docker_image: string;
  required_args: string[];
}

export const fallbackAgentDistribution: AgentDistribution = {
  repository: "cazi-cc/komari-agent",
  script_ref: "main",
  linux_script_url:
    "https://raw.githubusercontent.com/cazi-cc/komari-agent/refs/heads/main/install.sh",
  windows_script_url:
    "https://raw.githubusercontent.com/cazi-cc/komari-agent/refs/heads/main/install.ps1",
  docker_image: "ghcr.io/cazi-cc/komari-agent:snapshot",
  required_args: [
    "--disable-web-ssh",
    "--interval",
    "5",
    "--info-report-interval",
    "15",
  ],
};

let distributionPromise: Promise<AgentDistribution> | null = null;

function normalizeDistribution(value: unknown): AgentDistribution {
  if (!value || typeof value !== "object") {
    return fallbackAgentDistribution;
  }
  const candidate = value as Partial<AgentDistribution>;
  if (
    typeof candidate.repository !== "string" ||
    typeof candidate.linux_script_url !== "string" ||
    typeof candidate.windows_script_url !== "string" ||
    typeof candidate.docker_image !== "string" ||
    !Array.isArray(candidate.required_args)
  ) {
    return fallbackAgentDistribution;
  }
  return {
    repository: candidate.repository,
    script_ref: candidate.script_ref || "main",
    linux_script_url: candidate.linux_script_url,
    windows_script_url: candidate.windows_script_url,
    docker_image: candidate.docker_image,
    required_args: candidate.required_args.filter(
      (item): item is string => typeof item === "string",
    ),
  };
}

export async function getAgentDistribution(): Promise<AgentDistribution> {
  if (!distributionPromise) {
    distributionPromise = fetch("/api/admin/settings/agent-distribution")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        return normalizeDistribution(payload?.data);
      })
      .catch((error) => {
        console.warn("Failed to load agent distribution; using fork defaults.", error);
        return fallbackAgentDistribution;
      });
  }
  return distributionPromise;
}

export function useAgentDistribution() {
  const [distribution, setDistribution] = React.useState<AgentDistribution>(
    fallbackAgentDistribution,
  );

  React.useEffect(() => {
    let active = true;
    getAgentDistribution().then((value) => {
      if (active) {
        setDistribution(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return distribution;
}

export function withRequiredAgentArgs(
  base: string[],
  distribution: AgentDistribution,
): string[] {
  return [...base, ...distribution.required_args];
}

export function setBooleanAgentArg(
  args: string[],
  flag: string,
  enabled: boolean,
): void {
  for (let index = args.length - 1; index >= 0; index--) {
    if (args[index] === flag) {
      args.splice(index, 1);
    }
  }
  if (enabled) {
    args.push(flag);
  }
}

export function setAgentArgValue(
  args: string[],
  aliases: string[],
  flag: string,
  value: string | null,
): void {
  for (let index = args.length - 1; index >= 0; index--) {
    if (aliases.includes(args[index])) {
      args.splice(index, 2);
    }
  }
  if (value !== null) {
    args.push(flag, value);
  }
}

export function scriptURLForPlatform(
  distribution: AgentDistribution,
  platform: "linux" | "windows" | "macos" | "docker",
): string {
  return platform === "windows"
    ? distribution.windows_script_url
    : distribution.linux_script_url;
}
