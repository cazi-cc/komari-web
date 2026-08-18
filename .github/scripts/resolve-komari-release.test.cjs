"use strict";

// Keep the test in CommonJS so it exercises the same loader used by GitHub Actions.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { resolveKomariRelease } = require("./resolve-komari-release.cjs");

const stableRelease = {
  tag_name: "1.4.3",
  draft: false,
  prerelease: false,
  html_url: "https://github.com/komari-monitor/komari/releases/tag/1.4.3",
  published_at: "2026-08-13T10:20:16Z",
};

function notFound() {
  const error = new Error("Not Found");
  error.status = 404;
  return error;
}

function transientError() {
  const error = new Error("Bad Gateway");
  error.status = 502;
  return error;
}

function createCore() {
  const state = { failed: "", notices: [], outputs: {}, summary: [] };
  const summary = {
    addHeading(value) {
      state.summary.push(value);
      return this;
    },
    addRaw(value) {
      state.summary.push(value);
      return this;
    },
    async write() {},
  };
  return {
    state,
    core: {
      info() {},
      notice(message) {
        state.notices.push(message);
      },
      setFailed(message) {
        state.failed = message;
      },
      setOutput(key, value) {
        state.outputs[key] = value;
      },
      summary,
    },
  };
}

function context(eventName) {
  return { eventName, repo: { owner: "cazi-cc", repo: "komari-web" } };
}

const noWait = async () => {};

describe("resolveKomariRelease", () => {
  it("resolves the latest stable release and detects an existing mirror", async () => {
    const { core, state } = createCore();
    const github = {
      rest: {
        repos: {
          async getLatestRelease() {
            return { data: stableRelease };
          },
          async listReleases() {
            throw new Error("fallback should not run");
          },
          async getReleaseByTag() {
            return { data: stableRelease };
          },
        },
      },
    };

    const result = await resolveKomariRelease({
      github,
      context: context("schedule"),
      core,
      sleep: noWait,
    });

    assert.deepEqual(result, {
      status: "resolved",
      tag: "1.4.3",
      exists: true,
    });
    assert.equal(state.outputs.skip, "false");
    assert.equal(state.outputs.exists, "true");
    assert.equal(state.failed, "");
  });

  it("uses the release-list fallback when the latest endpoint fails", async () => {
    const { core, state } = createCore();
    const github = {
      rest: {
        repos: {
          async getLatestRelease() {
            throw transientError();
          },
          async listReleases() {
            return {
              data: [{ ...stableRelease, prerelease: true }, stableRelease],
            };
          },
          async getReleaseByTag() {
            throw notFound();
          },
        },
      },
    };

    const result = await resolveKomariRelease({
      github,
      context: context("schedule"),
      core,
      sleep: noWait,
    });

    assert.deepEqual(result, {
      status: "resolved",
      tag: "1.4.3",
      exists: false,
    });
    assert.equal(state.outputs.exists, "false");
    assert.equal(state.failed, "");
  });

  it("defers a scheduled run after repeated empty API responses", async () => {
    const { core, state } = createCore();
    let latestCalls = 0;
    let listCalls = 0;
    const github = {
      rest: {
        repos: {
          async getLatestRelease() {
            latestCalls += 1;
            throw notFound();
          },
          async listReleases() {
            listCalls += 1;
            return { data: [] };
          },
          async getReleaseByTag() {
            throw new Error("mirror lookup should not run");
          },
        },
      },
    };

    const result = await resolveKomariRelease({
      github,
      context: context("schedule"),
      core,
      sleep: noWait,
    });

    assert.equal(result.status, "deferred");
    assert.equal(latestCalls, 5);
    assert.equal(listCalls, 5);
    assert.equal(state.outputs.skip, "true");
    assert.equal(state.failed, "");
    assert.equal(state.notices.length, 1);
  });

  it("defers an automated repository dispatch when GitHub is unavailable", async () => {
    const { core, state } = createCore();
    const github = {
      rest: {
        repos: {
          async getReleaseByTag() {
            throw transientError();
          },
        },
      },
    };

    const result = await resolveKomariRelease({
      github,
      context: context("repository_dispatch"),
      core,
      env: { DISPATCH_TAG: "1.4.3", FORCE_RELEASE: "false" },
      sleep: noWait,
    });

    assert.equal(result.status, "deferred");
    assert.equal(state.outputs.skip, "true");
    assert.equal(state.failed, "");
  });

  it("fails a manual run that specifies an unknown release", async () => {
    const { core, state } = createCore();
    const github = {
      rest: {
        repos: {
          async getReleaseByTag() {
            throw notFound();
          },
        },
      },
    };

    const result = await resolveKomariRelease({
      github,
      context: context("workflow_dispatch"),
      core,
      env: { MANUAL_TAG: "9.9.9", FORCE_RELEASE: "false" },
      sleep: noWait,
    });

    assert.equal(result.status, "failed");
    assert.match(state.failed, /does not exist/);
    assert.notEqual(state.outputs.skip, "true");
  });
});
