"use client";

import { useEffect, useMemo, useState } from "react";

type Fight = {
  id: number;
  encounterID: number | null;
  name: string;
  kill: boolean;
  difficulty: number | null;
  startTime: number;
  endTime: number;
  durationMs: number;
};

type Actor = {
  id: number;
  name: string;
  type: string | null;
  subType: string | null;
  server: string | null;
};

type ReportResponse = {
  code: string;
  title: string;
  ownerName: string | null;
  fights: Fight[];
  actors: Actor[];
};

type BenchmarkCandidate = {
  rank: number | null;
  amount: number | null;
  reportCode: string;
  fightID: number | null;
  sourceID: number | null;
  characterName: string | null;
  totalTimeSeconds: number | null;
};

type BenchmarkResponse = {
  encounterID: number;
  encounterName: string;
  candidates: BenchmarkCandidate[];
};

type TimelineEvent = {
  t: number;
  abilityID: number | null;
  abilityName: string;
  type: string;
};

type CompareResponse = {
  userFight: Fight;
  referenceFight: Fight;
  timeline: {
    userCasts: TimelineEvent[];
    referenceCasts: TimelineEvent[];
    userBuffs: TimelineEvent[];
    referenceBuffs: TimelineEvent[];
  };
  insights: {
    topCastDiff: Array<{
      abilityName: string;
      userCount: number;
      referenceCount: number;
      delta: number;
    }>;
    openerDrift: Array<{
      abilityName: string;
      userTime: number;
      referenceTime: number;
      driftSeconds: number;
    }>;
    userCastCount: number;
    referenceCastCount: number;
    userBuffEvents: number;
    referenceBuffEvents: number;
  };
};

type ApiError = {
  error: string;
};

type AuthStatusResponse = {
  status: "idle" | "pending" | "completed" | "failed" | "expired";
  error?: string;
  message?: string;
};

async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 240)}`);
  }
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function abilityColor(abilityName: string) {
  let hash = 0;
  for (let index = 0; index < abilityName.length; index += 1) {
    hash = abilityName.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 52%)`;
}

function TimelineTrack(props: { events: TimelineEvent[]; durationSec: number; title: string }) {
  const duration = Math.max(props.durationSec, 1);
  return (
    <section className="timeline-panel">
      <h4>{props.title}</h4>
      <div className="timeline-track">
        {props.events.slice(0, 180).map((event, index) => {
          const left = `${Math.min((event.t / duration) * 100, 100)}%`;
          return (
            <span
              key={`${event.abilityName}-${event.t}-${index}`}
              className="timeline-dot"
              style={{ left, backgroundColor: abilityColor(event.abilityName) }}
              title={`${event.abilityName} @ ${event.t.toFixed(2)}s`}
            />
          );
        })}
      </div>
      <div className="timeline-meta">
        <span>{props.events.length} events</span>
        <span>{duration.toFixed(1)}s duration window</span>
      </div>
    </section>
  );
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse["status"]>("idle");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [startingAuth, setStartingAuth] = useState(false);
  const [loadingAuthStatus, setLoadingAuthStatus] = useState(false);
  const [consumingAuth, setConsumingAuth] = useState(false);

  const [reportCode, setReportCode] = useState("");
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const [selectedFightID, setSelectedFightID] = useState<number | null>(null);
  const [selectedSourceID, setSelectedSourceID] = useState<number | null>(null);
  const [className, setClassName] = useState("");
  const [specName, setSpecName] = useState("");
  const [metric, setMetric] = useState("dps");

  const [benchmarkData, setBenchmarkData] = useState<BenchmarkResponse | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState(false);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkCandidate | null>(null);

  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const selectedFight = useMemo(
    () => reportData?.fights.find((fight) => fight.id === selectedFightID) ?? null,
    [reportData, selectedFightID],
  );

  const playerActors = useMemo(
    () => (reportData?.actors ?? []).filter((actor) => actor.type === "Player"),
    [reportData],
  );

  async function beginOAuthFlow() {
    setStartingAuth(true);
    setAuthMessage(null);
    try {
      const response = await fetch("/api/auth/warcraftlogs/login", {
        method: "POST",
      });
      const body = (await readApiResponse(response)) as
        | { authorizeUrl: string; state: string }
        | ApiError;

      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Failed to start OAuth flow.");
      }
      if (!body || !("authorizeUrl" in body)) {
        throw new Error("OAuth start returned no authorize URL.");
      }

      const successBody = body as { authorizeUrl: string; state: string };
      setAuthStatus("pending");
      setAuthMessage("Opening Warcraft Logs, then handing control to joshgotro.com...");
      window.location.href = successBody.authorizeUrl;
    } catch (error) {
      setAuthStatus("failed");
      setAuthMessage(
        error instanceof Error ? error.message : "Failed to start Warcraft Logs OAuth.",
      );
    } finally {
      setStartingAuth(false);
    }
  }

  async function checkOAuthStatus() {
    setLoadingAuthStatus(true);
    try {
      const response = await fetch("/api/auth/warcraftlogs/status", {
        cache: "no-store",
      });
      const body = (await readApiResponse(response)) as AuthStatusResponse | ApiError | null;
      if (!response.ok) {
        throw new Error(body && "error" in body ? body.error : "Failed to check OAuth status.");
      }
      if (!body) {
        throw new Error("OAuth status returned an empty response.");
      }

      const typed = body as AuthStatusResponse;
      setAuthStatus(typed.status);
      setAuthMessage(
        typed.error ??
          typed.message ??
          (typed.status === "idle"
            ? "No bridge flow has been started yet."
            : typed.status === "pending"
              ? "Warcraft Logs auth is still waiting to complete."
              : null),
      );
    } catch (error) {
      setAuthStatus("failed");
      setAuthMessage(
        error instanceof Error ? error.message : "Failed to check Warcraft Logs status.",
      );
    } finally {
      setLoadingAuthStatus(false);
    }
  }

  async function finalizeOAuthConnection() {
    setConsumingAuth(true);
    try {
      const response = await fetch("/api/auth/warcraftlogs/consume", {
        method: "POST",
      });
      const body = (await readApiResponse(response)) as
        | { status: string; expiresIn: number; tokenType: string }
        | ApiError
        | null;
      if (!response.ok) {
        throw new Error(body && "error" in body ? body.error : "Failed to finalize OAuth.");
      }
      if (!body) {
        throw new Error("OAuth finalize returned an empty response.");
      }

      setAuthStatus("completed");
      setAuthMessage("Warcraft Logs connected locally. You can now use private-report flows.");
    } catch (error) {
      setAuthStatus("failed");
      setAuthMessage(
        error instanceof Error ? error.message : "Failed to finalize Warcraft Logs token.",
      );
    } finally {
      setConsumingAuth(false);
    }
  }

  useEffect(() => {
    void checkOAuthStatus();
  }, []);

  async function loadReport() {
    setLoadingReport(true);
    setReportError(null);
    setBenchmarkData(null);
    setSelectedBenchmark(null);
    setCompareData(null);
    setCompareError(null);

    try {
      const response = await fetch(`/api/wcl/report?code=${encodeURIComponent(reportCode)}`);
      const body = (await response.json()) as ReportResponse | ApiError;
      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Failed to load report.");
      }
      setReportData(body as ReportResponse);
      const firstFight = (body as ReportResponse).fights[0];
      setSelectedFightID(firstFight?.id ?? null);
      const firstPlayer = (body as ReportResponse).actors.find(
        (actor) => actor.type === "Player",
      );
      setSelectedSourceID(firstPlayer?.id ?? null);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Failed to load report.");
    } finally {
      setLoadingReport(false);
    }
  }

  async function loadBenchmarks() {
    if (!selectedFight?.encounterID) {
      setBenchmarkError("Select a fight with an encounter ID first.");
      return;
    }

    setLoadingBenchmarks(true);
    setBenchmarkError(null);
    setSelectedBenchmark(null);
    setCompareData(null);
    setCompareError(null);

    try {
      const params = new URLSearchParams();
      params.set("encounterID", String(selectedFight.encounterID));
      if (selectedFight.difficulty) {
        params.set("difficulty", String(selectedFight.difficulty));
      }
      if (className.trim()) {
        params.set("className", className.trim());
      }
      if (specName.trim()) {
        params.set("specName", specName.trim());
      }
      params.set("metric", metric);
      params.set("page", "1");
      params.set("size", "20");

      const response = await fetch(`/api/wcl/benchmark?${params.toString()}`);
      const body = (await response.json()) as BenchmarkResponse | ApiError;
      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Failed to load benchmarks.");
      }

      const typed = body as BenchmarkResponse;
      setBenchmarkData(typed);
      setSelectedBenchmark(typed.candidates[0] ?? null);
    } catch (error) {
      setBenchmarkError(
        error instanceof Error ? error.message : "Failed to load benchmarks.",
      );
    } finally {
      setLoadingBenchmarks(false);
    }
  }

  async function runComparison() {
    if (!reportData || !selectedFightID || !selectedSourceID || !selectedBenchmark) {
      setCompareError("Choose report, fight, player source, and benchmark first.");
      return;
    }
    if (!selectedBenchmark.fightID || !selectedBenchmark.sourceID) {
      setCompareError("Selected benchmark is missing fightID or sourceID.");
      return;
    }

    setLoadingCompare(true);
    setCompareError(null);
    setCompareData(null);

    try {
      const response = await fetch("/api/wcl/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userReportCode: reportData.code,
          userFightID: selectedFightID,
          userSourceID: selectedSourceID,
          referenceReportCode: selectedBenchmark.reportCode,
          referenceFightID: selectedBenchmark.fightID,
          referenceSourceID: selectedBenchmark.sourceID,
        }),
      });
      const body = (await response.json()) as CompareResponse | ApiError;
      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Failed to compare fights.");
      }
      setCompareData(body as CompareResponse);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : "Comparison failed.");
    } finally {
      setLoadingCompare(false);
    }
  }

  const userDurationSec = compareData
    ? compareData.userFight.durationMs / 1000
    : (selectedFight?.durationMs ?? 0) / 1000;
  const referenceDurationSec = compareData ? compareData.referenceFight.durationMs / 1000 : 1;

  return (
    <div className="page-shell">
      <main className="dashboard">
        <header className="hero">
          <div>
            <p className="eyebrow">discobardlogger MVP</p>
            <h1>Warcraft Log Fight Comparator</h1>
            <p>
              Pull a report, select your player source, find top logs, and compare cast and
              buff timelines in one view.
            </p>
          </div>
          <div className="hero-actions">
            <button className="oauth-link" onClick={beginOAuthFlow} disabled={startingAuth}>
              {startingAuth ? "Starting..." : "Connect Warcraft Logs"}
            </button>
            <button
              className="secondary-button"
              onClick={checkOAuthStatus}
              disabled={loadingAuthStatus}
            >
              {loadingAuthStatus ? "Checking..." : "Check Bridge Status"}
            </button>
          </div>
        </header>

        <section className="panel">
          <h2>OAuth Bridge Status</h2>
          <p className="status-copy">
            Start login here, complete authorization on Warcraft Logs, let your website
            callback finish the handoff, then return here to finalize the local session.
          </p>
          <div className="status-row">
            <span className={`status-pill status-${authStatus}`}>{authStatus}</span>
            {authMessage && <span className="status-message">{authMessage}</span>}
          </div>
          <div className="controls-grid">
            <button onClick={checkOAuthStatus} disabled={loadingAuthStatus}>
              {loadingAuthStatus ? "Checking..." : "Refresh OAuth Status"}
            </button>
            <button
              onClick={finalizeOAuthConnection}
              disabled={consumingAuth || authStatus !== "completed"}
            >
              {consumingAuth ? "Finalizing..." : "Finalize Local Connection"}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>1) Load Your Report</h2>
          <div className="controls-grid">
            <label>
              Report Code
              <input
                value={reportCode}
                onChange={(event) => setReportCode(event.target.value)}
                placeholder="e.g. ABCDefgh1234"
              />
            </label>
            <button onClick={loadReport} disabled={!reportCode || loadingReport}>
              {loadingReport ? "Loading..." : "Load Report"}
            </button>
          </div>
          {reportError && <p className="error">{reportError}</p>}
          {reportData && (
            <div className="report-summary">
              <p>
                <strong>{reportData.title}</strong> ({reportData.code})
              </p>
              <p>
                Owner: {reportData.ownerName ?? "Unknown"} | Fights: {reportData.fights.length} |
                Players: {playerActors.length}
              </p>
              <div className="controls-grid">
                <label>
                  Fight
                  <select
                    value={selectedFightID ?? ""}
                    onChange={(event) => setSelectedFightID(Number(event.target.value))}
                  >
                    {reportData.fights.map((fight) => (
                      <option key={fight.id} value={fight.id}>
                        #{fight.id} {fight.name} | {formatDuration(fight.durationMs)} | Diff{" "}
                        {fight.difficulty ?? "?"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Player Source ID
                  <select
                    value={selectedSourceID ?? ""}
                    onChange={(event) => setSelectedSourceID(Number(event.target.value))}
                  >
                    {playerActors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.name} ({actor.subType ?? "Unknown Spec"}) id:{actor.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>2) Find Top Performing References</h2>
          <div className="controls-grid benchmark-grid">
            <label>
              Class Name
              <input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="Mage, Warrior..."
              />
            </label>
            <label>
              Spec Name
              <input
                value={specName}
                onChange={(event) => setSpecName(event.target.value)}
                placeholder="Frost, Fury..."
              />
            </label>
            <label>
              Metric
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="dps">dps</option>
                <option value="hps">hps</option>
                <option value="playerscore">playerscore</option>
                <option value="playerspeed">playerspeed</option>
                <option value="rdps">rdps</option>
                <option value="cdps">cdps</option>
              </select>
            </label>
            <button onClick={loadBenchmarks} disabled={loadingBenchmarks || !selectedFight}>
              {loadingBenchmarks ? "Loading..." : "Find Benchmarks"}
            </button>
          </div>
          {benchmarkError && <p className="error">{benchmarkError}</p>}
          {benchmarkData && (
            <div className="benchmark-list">
              <p>
                {benchmarkData.encounterName} ({benchmarkData.encounterID}) |{" "}
                {benchmarkData.candidates.length} candidates
              </p>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Pick</th>
                      <th>Rank</th>
                      <th>Character</th>
                      <th>Metric</th>
                      <th>Report</th>
                      <th>Fight ID</th>
                      <th>Source ID</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkData.candidates.slice(0, 20).map((candidate, index) => (
                      <tr key={`${candidate.reportCode}-${candidate.fightID}-${index}`}>
                        <td>
                          <input
                            type="radio"
                            checked={selectedBenchmark === candidate}
                            onChange={() => setSelectedBenchmark(candidate)}
                          />
                        </td>
                        <td>{candidate.rank ?? "-"}</td>
                        <td>{candidate.characterName ?? "-"}</td>
                        <td>{candidate.amount?.toFixed(1) ?? "-"}</td>
                        <td>{candidate.reportCode}</td>
                        <td>{candidate.fightID ?? "-"}</td>
                        <td>{candidate.sourceID ?? "-"}</td>
                        <td>
                          {candidate.totalTimeSeconds
                            ? `${candidate.totalTimeSeconds.toFixed(1)}s`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>3) Run Comparison</h2>
          <button onClick={runComparison} disabled={loadingCompare || !selectedBenchmark}>
            {loadingCompare ? "Comparing..." : "Compare Timelines"}
          </button>
          {compareError && <p className="error">{compareError}</p>}
          {compareData && (
            <div className="comparison-results">
              <div className="stats-grid">
                <article>
                  <h3>Your Fight</h3>
                  <p>{compareData.userFight.name}</p>
                  <p>Duration: {formatDuration(compareData.userFight.durationMs)}</p>
                  <p>Casts: {compareData.insights.userCastCount}</p>
                  <p>Buff events: {compareData.insights.userBuffEvents}</p>
                </article>
                <article>
                  <h3>Reference Fight</h3>
                  <p>{compareData.referenceFight.name}</p>
                  <p>Duration: {formatDuration(compareData.referenceFight.durationMs)}</p>
                  <p>Casts: {compareData.insights.referenceCastCount}</p>
                  <p>Buff events: {compareData.insights.referenceBuffEvents}</p>
                </article>
              </div>

              <div className="timeline-grid">
                <TimelineTrack
                  events={compareData.timeline.userCasts}
                  durationSec={userDurationSec}
                  title="Your Casts Timeline"
                />
                <TimelineTrack
                  events={compareData.timeline.referenceCasts}
                  durationSec={referenceDurationSec}
                  title="Reference Casts Timeline"
                />
                <TimelineTrack
                  events={compareData.timeline.userBuffs}
                  durationSec={userDurationSec}
                  title="Your Buff Timeline"
                />
                <TimelineTrack
                  events={compareData.timeline.referenceBuffs}
                  durationSec={referenceDurationSec}
                  title="Reference Buff Timeline"
                />
              </div>

              <div className="insights-grid">
                <article>
                  <h3>Potential Missed Casts</h3>
                  <ul>
                    {compareData.insights.topCastDiff.length === 0 && <li>No cast deltas found.</li>}
                    {compareData.insights.topCastDiff.map((row) => (
                      <li key={row.abilityName}>
                        {row.abilityName}: you {row.userCount}, reference {row.referenceCount}
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <h3>Opener Drift</h3>
                  <ul>
                    {compareData.insights.openerDrift.length === 0 && (
                      <li>No shared opener casts found.</li>
                    )}
                    {compareData.insights.openerDrift.map((row, index) => (
                      <li key={`${row.abilityName}-${index}`}>
                        {row.abilityName}: {row.driftSeconds > 0 ? "+" : ""}
                        {row.driftSeconds}s
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
