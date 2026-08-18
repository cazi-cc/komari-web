"use strict";

// CommonJS is required because actions/github-script loads this module with require().

const UPSTREAM_REPOSITORY = { owner: "komari-monitor", repo: "komari" };
const DEFAULT_ATTEMPTS = 5;

function errorSummary(error) {
  const status = error?.status ? `HTTP ${error.status}` : "unknown status";
  return `${status}: ${error?.message || String(error)}`;
}

async function retry({ label, operation, core, sleep, attempts }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      core.info(
        `${label} attempt ${attempt}/${attempts} failed (${errorSummary(error)}).`,
      );
      if (attempt < attempts) {
        await sleep(2 ** attempt * 1000);
      }
    }
  }
  throw lastError;
}

async function getReleaseByTag({
  github,
  core,
  sleep,
  attempts,
  owner,
  repo,
  tag,
}) {
  return retry({
    label: `Resolve ${owner}/${repo} release ${tag}`,
    core,
    sleep,
    attempts,
    operation: async () => {
      try {
        const response = await github.rest.repos.getReleaseByTag({
          owner,
          repo,
          tag,
        });
        return response.data;
      } catch (error) {
        if (error?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
}

async function getLatestStableRelease({ github, core, sleep, attempts }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const latest =
        await github.rest.repos.getLatestRelease(UPSTREAM_REPOSITORY);
      if (!latest.data.draft && !latest.data.prerelease) {
        return latest.data;
      }
    } catch (error) {
      core.info(
        `Latest-release endpoint attempt ${attempt}/${attempts} failed (${errorSummary(error)}).`,
      );
    }

    try {
      const releases = await github.rest.repos.listReleases({
        ...UPSTREAM_REPOSITORY,
        per_page: 30,
      });
      const stable = releases.data.find(
        (release) => !release.draft && !release.prerelease,
      );
      if (stable) {
        return stable;
      }
      core.info(
        `Release-list endpoint attempt ${attempt}/${attempts} returned no stable release.`,
      );
    } catch (error) {
      core.info(
        `Release-list endpoint attempt ${attempt}/${attempts} failed (${errorSummary(error)}).`,
      );
    }

    if (attempt < attempts) {
      await sleep(2 ** attempt * 1000);
    }
  }
  return null;
}

async function resolveKomariRelease({
  github,
  context,
  core,
  env = process.env,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = DEFAULT_ATTEMPTS,
}) {
  const requestedTag = (env.MANUAL_TAG || env.DISPATCH_TAG || "").trim();
  const force = env.FORCE_RELEASE === "true";
  const automated =
    context.eventName === "schedule" ||
    context.eventName === "repository_dispatch";

  async function deferAutomatedRun(reason) {
    core.setOutput("skip", "true");
    core.setOutput("exists", "false");
    core.setOutput("force", String(force));
    core.notice(reason);
    await core.summary
      .addHeading("Komari Web release check")
      .addRaw(
        `${reason} No release was changed; the next scheduled run will retry automatically.`,
      )
      .write();
    return { status: "deferred", reason };
  }

  let release;
  try {
    if (requestedTag) {
      release = await getReleaseByTag({
        github,
        core,
        sleep,
        attempts,
        ...UPSTREAM_REPOSITORY,
        tag: requestedTag,
      });
    } else {
      release = await getLatestStableRelease({ github, core, sleep, attempts });
    }
  } catch (error) {
    if (automated) {
      return deferAutomatedRun(
        `GitHub temporarily could not resolve the upstream release (${errorSummary(error)}).`,
      );
    }
    const message = `Unable to resolve the requested Komari release: ${errorSummary(error)}.`;
    core.setFailed(message);
    return { status: "failed", reason: message };
  }

  const unsupportedRelease =
    !release ||
    release.draft ||
    (context.eventName !== "workflow_dispatch" && release.prerelease);
  if (unsupportedRelease) {
    if (automated) {
      return deferAutomatedRun(
        "GitHub temporarily returned no stable Komari release.",
      );
    }
    const message = requestedTag
      ? `Komari release ${requestedTag} does not exist or is still a draft.`
      : "Unable to resolve a stable Komari release.";
    core.setFailed(message);
    return { status: "failed", reason: message };
  }

  let mirroredRelease;
  try {
    mirroredRelease = await getReleaseByTag({
      github,
      core,
      sleep,
      attempts,
      ...context.repo,
      tag: release.tag_name,
    });
  } catch (error) {
    if (automated) {
      return deferAutomatedRun(
        `GitHub temporarily could not verify the mirrored release (${errorSummary(error)}).`,
      );
    }
    const message = `Unable to verify the mirrored release: ${errorSummary(error)}.`;
    core.setFailed(message);
    return { status: "failed", reason: message };
  }

  core.setOutput("tag", release.tag_name);
  core.setOutput("main_url", release.html_url);
  core.setOutput(
    "main_published_at",
    release.published_at || release.created_at || "",
  );
  core.setOutput("exists", String(Boolean(mirroredRelease)));
  core.setOutput("force", String(force));
  core.setOutput("skip", "false");
  return {
    status: "resolved",
    tag: release.tag_name,
    exists: Boolean(mirroredRelease),
  };
}

module.exports = {
  resolveKomariRelease,
};
