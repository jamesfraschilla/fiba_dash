import { supabase } from "./supabaseClient.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

async function getCurrentAccessToken() {
  requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || "";
}

function buildFallbackAnalysis({ game, range }) {
  const awayTeam = game?.awayTeam || {};
  const homeTeam = game?.homeTeam || {};
  const awayScore = Number(awayTeam.score || 0);
  const homeScore = Number(homeTeam.score || 0);
  const scoreDiff = homeScore - awayScore;
  const leader = scoreDiff === 0
    ? "Game is level"
    : scoreDiff > 0
      ? `${homeTeam.teamName || homeTeam.teamTricode || "Home"} leads by ${scoreDiff}`
      : `${awayTeam.teamName || awayTeam.teamTricode || "Away"} leads by ${Math.abs(scoreDiff)}`;
  const rangeLabel = range?.startLabel && range?.endLabel
    ? `${range.startLabel} to ${range.endLabel}`
    : "selected range";
  return {
    headline: "FIBA Analysis Fallback",
    summary: `${leader}. Detailed AI analysis is unavailable in this environment, so this summary is based on the normalized Sportradar game feed for the ${rangeLabel}.`,
    sections: [
      {
        title: "Source",
        bullets: [
          "Using the normalized Sportradar FIBA game payload.",
          "No NBA-specific backend analysis function is required for this fallback.",
        ],
      },
      {
        title: "Score State",
        bullets: [
          `${awayTeam.teamTricode || "AWAY"} ${awayScore} - ${homeScore} ${homeTeam.teamTricode || "HOME"}`,
          `Current status: ${game?.gameStatusText || "Unknown"}.`,
        ],
      },
    ],
    swingFactors: [],
    lineupNotes: [],
    statOutliers: [],
    uniformDetails: null,
  };
}

export async function requestGameAnalysis({ gameId, game, minutesData, range }) {
  if (!supabase) {
    return buildFallbackAnalysis({ game, range });
  }
  try {
    const accessToken = await getCurrentAccessToken();
    const { data, error } = await supabase.functions.invoke("game-analysis", {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: {
        accessToken,
        gameId,
        game,
        minutesData,
        range,
      },
    });

    if (error) {
      throw new Error(error.message || "Unable to generate analysis.");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch {
    return buildFallbackAnalysis({ game, range });
  }
}
