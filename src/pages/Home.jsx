import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FIBA_DEFAULT_COMPETITION_ID,
  fetchCompetitionOptions,
  fetchGamesByDate,
  fetchSeasonGameDates,
  fetchSeasonCompetitors,
  fetchSeasonOptions,
  fetchTeamSeasonGames,
  resolveDefaultSeasonId,
  teamLogoUrl,
} from "../api.js";
import {
  formatDateInput,
  formatDateLabel,
  formatGameDateLabel,
  gameStatusLabel,
  normalizeClock,
  parseDateInput,
} from "../utils.js";
import styles from "./Home.module.css";

export default function Home() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("d");
  const competitionId = params.get("competition") || FIBA_DEFAULT_COMPETITION_ID;
  const seasonParam = params.get("season") || "";
  const selectedTeamId = params.get("team") || "";
  const selectedOpponentTeamId = params.get("opponent") || "";
  const date = dateParam ? parseDateInput(dateParam) : new Date();
  const dateInput = formatDateInput(date);
  const dateLabel = formatDateLabel(date);

  const { data: competitions = [], error: competitionsError } = useQuery({
    queryKey: ["fiba-competitions"],
    queryFn: fetchCompetitionOptions,
    staleTime: 5 * 60_000,
  });

  const { data: seasons = [], error: seasonsError } = useQuery({
    queryKey: ["fiba-seasons", competitionId],
    queryFn: () => fetchSeasonOptions(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 5 * 60_000,
  });

  const { data: resolvedSeasonId = "", error: resolvedSeasonError } = useQuery({
    queryKey: ["fiba-default-season", competitionId],
    queryFn: () => resolveDefaultSeasonId(competitionId),
    enabled: Boolean(competitionId && !seasonParam),
    staleTime: 5 * 60_000,
  });

  const selectedSeasonId = seasonParam || resolvedSeasonId;

  const { data: teams = [], error: teamsError } = useQuery({
    queryKey: ["fiba-season-teams", selectedSeasonId],
    queryFn: () => fetchSeasonCompetitors(selectedSeasonId),
    enabled: Boolean(selectedSeasonId),
    staleTime: 5 * 60_000,
  });

  const { data: availableGameDates = [] } = useQuery({
    queryKey: ["fiba-season-game-dates", selectedSeasonId],
    queryFn: () => fetchSeasonGameDates(selectedSeasonId),
    enabled: Boolean(selectedSeasonId && !selectedTeamId),
    staleTime: 5 * 60_000,
  });

  const selectedTeam = teams.find((team) => team.teamId === selectedTeamId) || null;
  const selectedOpponentTeam = teams.find((team) => team.teamId === selectedOpponentTeamId) || null;

  function updateParams(mutator) {
    const nextParams = new URLSearchParams(params);
    mutator(nextParams);
    setParams(nextParams);
  }

  function changeDateBy(deltaDays) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
    updateParams((nextParams) => {
      nextParams.set("d", formatDateInput(next));
    });
  }

  function handleCompetitionChange(event) {
    const nextCompetitionId = event.target.value;
    updateParams((nextParams) => {
      if (nextCompetitionId) {
        nextParams.set("competition", nextCompetitionId);
      } else {
        nextParams.delete("competition");
      }
      nextParams.delete("season");
      nextParams.delete("team");
      nextParams.delete("opponent");
    });
  }

  function handleSeasonChange(event) {
    const nextSeasonId = event.target.value;
    updateParams((nextParams) => {
      if (nextSeasonId) {
        nextParams.set("season", nextSeasonId);
      } else {
        nextParams.delete("season");
      }
      nextParams.delete("team");
      nextParams.delete("opponent");
    });
  }

  function handleTeamChange(event) {
    const nextTeamId = event.target.value;
    updateParams((nextParams) => {
      if (nextTeamId) {
        nextParams.set("team", nextTeamId);
      } else {
        nextParams.delete("team");
      }
      nextParams.delete("opponent");
    });
  }

  function handleOpponentChange(event) {
    const nextOpponentTeamId = event.target.value;
    updateParams((nextParams) => {
      if (nextOpponentTeamId) {
        nextParams.set("opponent", nextOpponentTeamId);
      } else {
        nextParams.delete("opponent");
      }
    });
  }

  function clearTeamFilter() {
    updateParams((nextParams) => {
      nextParams.delete("team");
      nextParams.delete("opponent");
    });
  }

  function clearOpponentFilter() {
    updateParams((nextParams) => {
      nextParams.delete("opponent");
    });
  }

  const { data: games = [], isLoading, error } = useQuery({
    queryKey: selectedTeamId
      ? ["fiba-team-games", selectedSeasonId, selectedTeamId, selectedOpponentTeamId]
      : ["fiba-games", selectedSeasonId, dateInput],
    queryFn: () => (selectedTeamId
      ? fetchTeamSeasonGames(selectedTeamId, selectedOpponentTeamId, selectedSeasonId)
      : fetchGamesByDate(dateInput, { seasonId: selectedSeasonId, competitionId })),
    enabled: Boolean(selectedSeasonId),
  });

  const activeError = competitionsError || seasonsError || resolvedSeasonError || teamsError || error || null;
  const activeErrorMessage = String(activeError?.message || "").trim();
  const isMissingDataSource = activeErrorMessage.includes("Sportradar data source is not configured")
    || activeErrorMessage.includes("Sportradar proxy is not configured")
    || activeErrorMessage.includes("Missing SPORTRADAR_API_KEY secret");

  const competitionLabel = competitions.find((competition) => competition.id === competitionId)?.name || "Competition";
  const seasonLabel = seasons.find((season) => season.id === selectedSeasonId)?.name || "Season";

  const filteredGames = useMemo(() => {
    if (!selectedTeamId) return games;
    return games;
  }, [games, selectedTeamId]);

  useEffect(() => {
    if (dateParam || selectedTeamId || !selectedSeasonId || !availableGameDates.length) return;
    const today = formatDateInput(new Date());
    const nextAvailableDate = availableGameDates.find((value) => value >= today) || availableGameDates[availableGameDates.length - 1];
    if (!nextAvailableDate || nextAvailableDate === today) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set("d", nextAvailableDate);
    setParams(nextParams, { replace: true });
  }, [availableGameDates, dateParam, params, selectedSeasonId, selectedTeamId, setParams]);

  const renderFilters = () => (
    <>
      <div className={styles.filterControl}>
        <label className={styles.teamFilter}>
          <select
            className={styles.teamSelect}
            value={competitionId}
            onChange={handleCompetitionChange}
            aria-label="Select competition"
          >
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.filterControl}>
        <label className={styles.teamFilter}>
          <select
            className={styles.teamSelect}
            value={selectedSeasonId}
            onChange={handleSeasonChange}
            aria-label="Select season"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.filterControl}>
        <label className={styles.teamFilter}>
          <select
            className={styles.teamSelect}
            value={selectedTeamId}
            onChange={handleTeamChange}
            aria-label="Select team"
          >
            <option value="">Team (Select)</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
            ))}
          </select>
        </label>
        {selectedTeamId ? (
          <button
            type="button"
            className={styles.clearFilterButton}
            onClick={clearTeamFilter}
            aria-label="Clear team filter"
          >
            X
          </button>
        ) : null}
      </div>
      {selectedTeamId ? (
        <div className={styles.filterControl}>
          <label className={styles.teamFilter}>
            <select
              className={styles.teamSelect}
              value={selectedOpponentTeamId}
              onChange={handleOpponentChange}
              aria-label="Select opponent"
            >
              <option value="">Opponent</option>
              {teams.filter((team) => team.teamId !== selectedTeamId).map((team) => (
                <option key={`opponent-${team.teamId}`} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
          {selectedOpponentTeamId ? (
            <button
              type="button"
              className={styles.clearFilterButton}
              onClick={clearOpponentFilter}
              aria-label="Clear opponent filter"
            >
              X
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {selectedTeamId ? "Loading team games..." : "Loading games..."}
        </div>
      </div>
    );
  }

  if (activeError) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {isMissingDataSource
            ? "Sportradar data is not configured for this environment yet."
            : `Failed to load ${selectedTeamId ? "team games" : "games"}.`}
        </div>
      </div>
    );
  }

  if (!filteredGames.length) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {selectedTeamId
            ? (selectedOpponentTeamId
              ? "No games found between these teams in the selected season."
              : "No games found for this team in the selected season.")
            : "No games scheduled for this date in the selected season."}
        </div>
      </div>
    );
  }

  const renderGames = (list) =>
    list.map((game) => {
      const status = gameStatusLabel(game);
      const isLive = game.gameStatus === 2;
      const scoreVisible = game.gameStatus === 2 || game.gameStatus === 3;
      const clock = isLive ? normalizeClock(game.gameClock) : "";
      const metadata = [];

      if (selectedTeamId && game.gameDate) {
        metadata.push(formatGameDateLabel(game.gameDate));
      }
      if (selectedTeamId && game.seasonType) {
        metadata.push(game.seasonType);
      } else if (game.arena?.arenaName) {
        metadata.push(game.arena.arenaName);
      } else {
        metadata.push(competitionLabel);
        metadata.push(seasonLabel);
      }

      const linkDateParam = selectedTeamId ? game.gameDate : dateParam;

      return (
        <Link
          key={game.gameId}
          className={styles.gameCard}
          to={`/g/${encodeURIComponent(game.gameId)}${linkDateParam ? `?d=${linkDateParam}` : ""}`}
        >
          <div className={styles.mainContent}>
            <div className={styles.teams}>
              {[game.awayTeam, game.homeTeam].map((team) => (
                <div key={team.teamId} className={styles.teamRow}>
                  <div
                    className={styles.teamLogo}
                    style={{ backgroundImage: `url(${teamLogoUrl(team.teamId)})` }}
                  />
                  <div className={styles.teamInfo}>
                    <div className={styles.teamHeader}>
                      <div className={styles.teamTricode}>{team.teamTricode}</div>
                      {scoreVisible && <div className={styles.score}>{team.score}</div>}
                    </div>
                    <div className={styles.teamRecord}>{team.teamName}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.statusBlock}>
              <div className={styles.status}>{status || "Scheduled"}</div>
              {clock ? <div className={styles.clock}>{clock}</div> : null}
              {metadata.length ? (
                <div className={styles.metadata}>
                  {metadata.filter(Boolean).join(" • ")}
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      );
    });

  return (
    <div className={styles.container}>
      <div className={styles.dateNav}>
        <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
          Prev
        </button>
        <div className={styles.dateLabel}>{dateLabel}</div>
        <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
          Next
        </button>
        {renderFilters()}
      </div>

      <div className={styles.gameList}>{renderGames(filteredGames)}</div>

      {(selectedTeam || selectedOpponentTeam) ? (
        <div className={styles.stateMessage}>
          Viewing {selectedTeam?.fullName || "team"}
          {selectedOpponentTeam ? ` vs ${selectedOpponentTeam.fullName}` : ""}
          {" "}in {seasonLabel}.
        </div>
      ) : null}
    </div>
  );
}
