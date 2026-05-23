const SPORTRADAR_API_KEY = String(import.meta.env.VITE_SPORTRADAR_API_KEY || "").trim();
const SPORTRADAR_ACCESS_LEVEL = String(import.meta.env.VITE_SPORTRADAR_ACCESS_LEVEL || "trial").trim() || "trial";
const SPORTRADAR_LANGUAGE = String(import.meta.env.VITE_SPORTRADAR_LANGUAGE || "en").trim() || "en";
const DEFAULT_COMPETITION_ID = String(import.meta.env.VITE_FIBA_DEFAULT_COMPETITION_ID || "sr:competition:17788").trim();
const DEFAULT_SEASON_ID = String(import.meta.env.VITE_FIBA_DEFAULT_SEASON_ID || "").trim();
const API_BASE = `https://api.sportradar.com/basketball/${SPORTRADAR_ACCESS_LEVEL}/v2/${SPORTRADAR_LANGUAGE}`;
const COMPETITIONS_URL = `${API_BASE}/competitions.json`;
const REGULATION_PERIOD_SECONDS = 10 * 60;
const OVERTIME_PERIOD_SECONDS = 5 * 60;
const FLAG_CODE_BY_ABBREVIATION = {
  ANG: "ao",
  ARG: "ar",
  ARM: "am",
  AUS: "au",
  AUT: "at",
  AZE: "az",
  BAH: "bs",
  BEL: "be",
  BIH: "ba",
  BRA: "br",
  BUL: "bg",
  CAN: "ca",
  CHN: "cn",
  CIV: "ci",
  CMR: "cm",
  CPV: "cv",
  CRO: "hr",
  CYP: "cy",
  CZE: "cz",
  DEN: "dk",
  DOM: "do",
  EGY: "eg",
  ESP: "es",
  EST: "ee",
  FIN: "fi",
  FRA: "fr",
  GBR: "gb",
  GEO: "ge",
  GER: "de",
  GRE: "gr",
  HUN: "hu",
  IRI: "ir",
  IRN: "ir",
  ISR: "il",
  ITA: "it",
  JOR: "jo",
  JPN: "jp",
  KOR: "kr",
  LAT: "lv",
  LBN: "lb",
  LTU: "lt",
  LUX: "lu",
  MEX: "mx",
  MKD: "mk",
  MNE: "me",
  MRI: "mr",
  NED: "nl",
  NZL: "nz",
  PHI: "ph",
  PHL: "ph",
  POL: "pl",
  POR: "pt",
  PRI: "pr",
  ROU: "ro",
  RSA: "za",
  SEN: "sn",
  SRB: "rs",
  SLO: "si",
  SVN: "si",
  SSD: "ss",
  SUI: "ch",
  SWE: "se",
  THA: "th",
  TUR: "tr",
  TPE: "tw",
  TUN: "tn",
  UAE: "ae",
  UKR: "ua",
  URU: "uy",
  USA: "us",
  VEN: "ve",
};

const competitionsCache = new Map();
const seasonsCache = new Map();
const seasonCompetitorsCache = new Map();
const seasonSummariesCache = new Map();
const gameSummaryCache = new Map();
const gameTimelineCache = new Map();
const teamRegistry = new Map();
const MENS_WORLD_CUP_2027_COMPETITION_PRIORITY = [
  "sr:competition:17788", // World Cup Qualification, Asia & Oceania
  "sr:competition:17324", // World Cup Qualification, Americas
  "sr:competition:16882", // World Cup Qualification, Europe
  "sr:competition:17304", // World Cup Qualification, Africa
  "sr:competition:441",   // FIBA World Cup
];
const MENS_WORLD_CUP_2027_COMPETITION_IDS = new Set(MENS_WORLD_CUP_2027_COMPETITION_PRIORITY);

function requireApiKey() {
  if (!SPORTRADAR_API_KEY) {
    throw new Error("Sportradar API key is not configured. Set VITE_SPORTRADAR_API_KEY.");
  }
}

async function requestJson(url) {
  requireApiKey();
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-api-key": SPORTRADAR_API_KEY,
    },
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }
  return response.json();
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCompetition(competition = {}) {
  return {
    id: normalizeText(competition.id),
    name: normalizeText(competition.name),
    gender: normalizeText(competition.gender),
    categoryName: normalizeText(competition.category?.name),
    countryCode: normalizeText(competition.category?.country_code),
  };
}

function normalizeSeason(season = {}) {
  return {
    id: normalizeText(season.id),
    name: normalizeText(season.name),
    year: normalizeText(season.year),
    startDate: normalizeText(season.start_date),
    endDate: normalizeText(season.end_date),
    competitionId: normalizeText(season.competition_id),
  };
}

function buildLogoDataUri(label) {
  const text = normalizeText(label).slice(0, 4).toUpperCase() || "FIBA";
  const hash = [...text].reduce((total, character) => total + character.charCodeAt(0), 0);
  const hue = hash % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="18" fill="hsl(${hue} 55% 45%)"/>
      <rect x="6" y="6" width="108" height="108" rx="14" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <text x="60" y="68" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#ffffff">${text}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildFlagUrl(abbreviation) {
  const flagCode = FLAG_CODE_BY_ABBREVIATION[normalizeText(abbreviation).toUpperCase()];
  if (!flagCode) return "";
  return `https://flagcdn.com/w80/${flagCode}.png`;
}

function registerTeam(team = {}) {
  const teamId = normalizeText(team.teamId || team.id);
  if (!teamId) return null;
  const existing = teamRegistry.get(teamId) || {};
  const next = {
    teamId,
    id: teamId,
    fullName: normalizeText(team.fullName || team.name || existing.fullName),
    teamName: normalizeText(team.teamName || team.fullName || team.name || existing.teamName),
    teamCity: normalizeText(team.teamCity || existing.teamCity),
    teamTricode: normalizeText(team.teamTricode || team.abbreviation || existing.teamTricode),
    logoUrl: normalizeText(team.logoUrl || existing.logoUrl),
  };
  if (!next.logoUrl) {
    next.logoUrl = buildFlagUrl(next.teamTricode) || buildLogoDataUri(next.teamTricode || next.teamName || next.fullName);
  }
  teamRegistry.set(teamId, next);
  return next;
}

function getRegisteredTeam(teamId) {
  return teamRegistry.get(normalizeText(teamId)) || null;
}

function normalizeCompetitor(competitor = {}) {
  const registered = registerTeam({
    teamId: competitor.id,
    fullName: competitor.name,
    teamName: competitor.name,
    teamCity: "",
    teamTricode: competitor.abbreviation || competitor.short_name || competitor.name,
  });
  return {
    teamId: registered?.teamId || normalizeText(competitor.id),
    teamName: registered?.teamName || normalizeText(competitor.name),
    teamCity: registered?.teamCity || "",
    teamTricode: registered?.teamTricode || normalizeText(competitor.abbreviation),
    wins: null,
    losses: null,
    score: 0,
    timeoutsRemaining: 0,
  };
}

function parseDatePart(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function parseFibaPlayerName(value) {
  const text = normalizeText(value);
  if (!text) {
    return { firstName: "", familyName: "", fullName: "" };
  }
  if (text.includes(",")) {
    const [familyName, firstName] = text.split(",").map((part) => normalizeText(part));
    return {
      firstName,
      familyName,
      fullName: [firstName, familyName].filter(Boolean).join(" "),
    };
  }
  const parts = text.split(/\s+/).filter(Boolean);
  return {
    firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
    familyName: parts.length > 1 ? parts[parts.length - 1] : "",
    fullName: text,
  };
}

function toIsoClock(minutes, seconds) {
  return `PT${safeNumber(minutes)}M${String(Math.max(0, safeNumber(seconds, 0)).toFixed(0))}.00S`;
}

function toIsoMinutes(clockText) {
  const match = /^(\d+):(\d{2})$/.exec(normalizeText(clockText));
  if (!match) return "PT0M0.00S";
  return toIsoClock(Number(match[1]), Number(match[2]));
}

function parseElapsedClock(value) {
  const match = /^(\d+):(\d{2})$/.exec(normalizeText(value));
  if (!match) return 0;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function periodNameToNumber(periodName) {
  const normalized = normalizeText(periodName).toLowerCase();
  if (!normalized) return 0;
  if (normalized.startsWith("1st")) return 1;
  if (normalized.startsWith("2nd")) return 2;
  if (normalized.startsWith("3rd")) return 3;
  if (normalized.startsWith("4th")) return 4;
  const overtimeMatch = /overtime(?:\s+(\d+))?/.exec(normalized);
  if (overtimeMatch) {
    return 4 + safeNumber(overtimeMatch[1], 1);
  }
  return 0;
}

function regulationSecondsForPeriod(period) {
  return period > 4 ? OVERTIME_PERIOD_SECONDS : REGULATION_PERIOD_SECONDS;
}

function elapsedClockToRemainingIso(matchClock, period) {
  const elapsed = parseElapsedClock(matchClock);
  const total = regulationSecondsForPeriod(period);
  const remaining = Math.max(0, total - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return toIsoClock(minutes, seconds);
}

function mapGameStatus(statusText) {
  const normalized = normalizeText(statusText).toLowerCase();
  if (normalized === "closed" || normalized === "ended") return 3;
  if (normalized === "live") return 2;
  return 1;
}

function estimatePossessions(teamTotals = {}, opponentTotals = {}) {
  const teamFga = safeNumber(teamTotals.fieldGoalsAttempted, 0);
  const teamFta = safeNumber(teamTotals.freeThrowsAttempted, 0);
  const teamOrb = safeNumber(teamTotals.reboundsOffensive, 0);
  const teamTov = safeNumber(teamTotals.turnovers, 0);
  const oppFga = safeNumber(opponentTotals.fieldGoalsAttempted, 0);
  const oppFta = safeNumber(opponentTotals.freeThrowsAttempted, 0);
  const oppOrb = safeNumber(opponentTotals.reboundsOffensive, 0);
  const oppTov = safeNumber(opponentTotals.turnovers, 0);
  return 0.5 * (
    (teamFga + 0.44 * teamFta - teamOrb + teamTov) +
    (oppFga + 0.44 * oppFta - oppOrb + oppTov)
  );
}

function parseTeamTotals(statistics = {}) {
  const twoPointersMade = safeNumber(statistics.two_point_attempts_successful, 0);
  const twoPointersAttempted = safeNumber(statistics.two_point_attempts_total, 0);
  const threePointersMade = safeNumber(statistics.three_point_attempts_successful, 0);
  const threePointersAttempted = safeNumber(statistics.three_point_attempts_total, 0);
  const fieldGoalsMade = twoPointersMade + threePointersMade;
  const fieldGoalsAttempted = twoPointersAttempted + threePointersAttempted;
  return {
    points: safeNumber(statistics.points, 0),
    reboundsTotal: safeNumber(statistics.rebounds, 0),
    reboundsOffensive: safeNumber(statistics.offensive_rebounds, 0),
    assists: safeNumber(statistics.assists, 0),
    blocks: safeNumber(statistics.shots_blocked, 0),
    steals: safeNumber(statistics.steals, 0),
    turnovers: safeNumber(statistics.turnovers, 0),
    foulsPersonal: safeNumber(statistics.fouls, 0),
    fieldGoalsMade,
    fieldGoalsAttempted,
    threePointersMade,
    threePointersAttempted,
    freeThrowsMade: safeNumber(statistics.free_throw_attempts_successful, 0),
    freeThrowsAttempted: safeNumber(statistics.free_throw_attempts_total, 0),
    rimFieldGoalsMade: twoPointersMade,
    rimFieldGoalsAttempted: twoPointersAttempted,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
    drivingFGMade: 0,
    drivingFGAttempted: 0,
    cuttingFGMade: 0,
    cuttingFGAttempted: 0,
    catchAndShoot3FGMade: 0,
    catchAndShoot3FGAttempted: 0,
    secondChance3FGMade: 0,
    secondChance3FGAttempted: 0,
    offensiveFoulsDrawn: 0,
    transitionPoints: 0,
    transitionTurnovers: 0,
    transitionPossessions: 0,
    secondChancePoints: 0,
    pointsOffTurnovers: 0,
    paintPoints: twoPointersMade * 2,
    threePointOReb: 0,
    chargesDrawn: 0,
    deflections: 0,
  };
}

function parsePlayerStats(player = {}) {
  const { firstName, familyName, fullName } = parseFibaPlayerName(player.name);
  const statistics = player.statistics || {};
  const fieldGoalsMade = safeNumber(statistics.field_goals_made, 0);
  const fieldGoalsAttempted = safeNumber(statistics.field_goals_attempted, 0);
  const threePointersMade = safeNumber(statistics.three_pointers_made, 0);
  const threePointersAttempted = safeNumber(statistics.three_pointers_attempted, 0);
  const twoPointersMade = Math.max(0, fieldGoalsMade - threePointersMade);
  const twoPointersAttempted = Math.max(0, fieldGoalsAttempted - threePointersAttempted);
  return {
    personId: normalizeText(player.id),
    firstName,
    familyName,
    fullName,
    jerseyNum: "",
    position: "",
    minutes: toIsoMinutes(normalizeText(statistics.minutes)),
    plusMinusPoints: 0,
    points: safeNumber(statistics.points, 0),
    reboundsTotal: safeNumber(statistics.total_rebounds, 0),
    reboundsOffensive: safeNumber(statistics.offensive_rebounds, 0),
    assists: safeNumber(statistics.assists, 0),
    blocks: safeNumber(statistics.blocks, 0),
    steals: safeNumber(statistics.steals, 0),
    turnovers: safeNumber(statistics.turnovers, 0),
    foulsPersonal: safeNumber(statistics.personal_fouls, 0),
    fieldGoalsMade,
    fieldGoalsAttempted,
    threePointersMade,
    threePointersAttempted,
    freeThrowsMade: safeNumber(statistics.free_throws_made, 0),
    freeThrowsAttempted: safeNumber(statistics.free_throws_attempted, 0),
    offensiveRating: null,
    defensiveRating: null,
    rimFieldGoalsMade: twoPointersMade,
    rimFieldGoalsAttempted: twoPointersAttempted,
    midFieldGoalsMade: 0,
    midFieldGoalsAttempted: 0,
    chargesDrawn: 0,
    deflections: 0,
  };
}

function parseSportEventTeams(sportEvent = {}, status = {}) {
  const competitors = Array.isArray(sportEvent.competitors) ? sportEvent.competitors : [];
  const homeCompetitor = competitors.find((competitor) => competitor.qualifier === "home") || competitors[0] || {};
  const awayCompetitor = competitors.find((competitor) => competitor.qualifier === "away") || competitors[1] || {};
  const homeTeam = {
    ...normalizeCompetitor(homeCompetitor),
    score: safeNumber(status.home_score, 0),
  };
  const awayTeam = {
    ...normalizeCompetitor(awayCompetitor),
    score: safeNumber(status.away_score, 0),
  };
  return { homeTeam, awayTeam };
}

function normalizeScheduledGame(summary = {}) {
  const sportEvent = summary.sport_event || {};
  const status = summary.sport_event_status || {};
  const { homeTeam, awayTeam } = parseSportEventTeams(sportEvent, status);
  const periodScores = Array.isArray(status.period_scores) ? status.period_scores : [];
  return {
    gameId: normalizeText(sportEvent.id),
    gameCode: "",
    gameStatus: mapGameStatus(status.status),
    gameStatusText: normalizeText(status.match_status || status.status),
    period: periodScores.length,
    gameClock: "PT0M0.00S",
    gameTimeUTC: normalizeText(sportEvent.start_time),
    gameEt: normalizeText(sportEvent.start_time),
    seasonYear: normalizeText(sportEvent.sport_event_context?.season?.year),
    seasonType: normalizeText(sportEvent.sport_event_context?.competition?.name),
    gameDate: parseDatePart(sportEvent.start_time),
    arena: {
      arenaName: normalizeText(sportEvent.venue?.name),
      arenaState: "",
      arenaCity: normalizeText(sportEvent.venue?.city_name),
    },
    homeTeam,
    awayTeam,
  };
}

function mapTimelineAction(event = {}, context = {}) {
  const homeTeamId = context.homeTeam?.teamId;
  const awayTeamId = context.awayTeam?.teamId;
  const period = safeNumber(event.period, periodNameToNumber(event.period_name));
  const competitor = normalizeText(event.competitor).toLowerCase();
  const teamId = competitor === "home" ? homeTeamId : competitor === "away" ? awayTeamId : null;
  const teamTricode = teamId === homeTeamId
    ? context.homeTeam?.teamTricode
    : teamId === awayTeamId
      ? context.awayTeam?.teamTricode
      : null;
  let actionType = "";
  let subType = "";
  let descriptor = "";
  let shotResult = null;
  if (event.type === "score_change") {
    actionType = event.points === 3 ? "3pt" : event.points === 1 ? "freethrow" : "2pt";
    shotResult = "Made";
    descriptor = event.points === 3 ? "Made 3PT FG" : event.points === 1 ? "Made FT" : "Made 2PT FG";
  } else if (event.type === "attempt_missed") {
    actionType = event.points === 3 ? "3pt" : event.points === 1 ? "freethrow" : "2pt";
    shotResult = "Missed";
    descriptor = event.points === 3 ? "Missed 3PT FG" : event.points === 1 ? "Missed FT" : "Missed 2PT FG";
  } else if (event.type === "rebound") {
    actionType = "rebound";
    descriptor = "Rebound";
  } else if (event.type === "foul") {
    actionType = "foul";
    subType = "personal";
    descriptor = "Foul";
  } else if (event.type === "timeout") {
    actionType = "timeout";
    descriptor = "Timeout";
  } else if (event.type === "free_throws_awarded") {
    actionType = "freethrow";
    descriptor = "Free Throws Awarded";
  } else {
    actionType = normalizeText(event.type);
    descriptor = normalizeText(event.type).replace(/_/g, " ");
  }
  return {
    actionNumber: safeNumber(event.id, 0),
    clock: elapsedClockToRemainingIso(event.match_clock, period || 1),
    timeActual: normalizeText(event.time),
    period,
    teamId,
    teamTricode,
    actionType,
    subType,
    descriptor,
    qualifiers: null,
    personId: null,
    playerName: null,
    playerNameI: null,
    x: event.x ?? null,
    y: event.y ?? null,
    side: null,
    shotDistance: null,
    shotResult,
    possession: 0,
    isFieldGoal: actionType === "2pt" || actionType === "3pt" ? 1 : 0,
    scoreHome: normalizeText(event.home_score),
    scoreAway: normalizeText(event.away_score),
    orderNumber: safeNumber(event.id, 0),
    location: "",
    description: descriptor,
    isTargetScoreLastPeriod: false,
    assistPlayerNameI: "",
    assistPersonId: 0,
    assistTotal: 0,
    reboundTotal: 0,
    reboundDefensiveTotal: 0,
    reboundOffensiveTotal: 0,
    turnoverTotal: 0,
    stealPlayerNameI: "",
    stealPersonId: 0,
    foulPersonalTotal: 0,
    foulTechnicalTotal: 0,
    foulDrawnPlayerName: "",
    foulDrawnPersonId: 0,
    jumpBallRecoveredNameInitial: "",
    jumpBallRecoveredPersonId: 0,
    jumpBallWonPlayerNameI: "",
    jumpBallWonPersonId: 0,
    jumpBallLostPlayerNameI: "",
    jumpBallLostPersonId: 0,
    edited: "",
    xLegacy: event.x ?? null,
    yLegacy: event.y ?? null,
    officialId: null,
    area: null,
    areaDetail: null,
    personIdsFilter: [],
  };
}

function buildTeamStats(homeTotals, awayTotals) {
  const homePossessions = estimatePossessions(homeTotals, awayTotals);
  const awayPossessions = estimatePossessions(awayTotals, homeTotals);
  const baseAdvanced = {
    drivingFGPercent: 0,
    drivingFGMade: 0,
    drivingFGAttempted: 0,
    cuttingFGPercent: 0,
    cuttingFGMade: 0,
    cuttingFGAttempted: 0,
    catchAndShoot3FGPercent: 0,
    catchAndShoot3FGMade: 0,
    catchAndShoot3FGAttempted: 0,
    chargesDrawn: 0,
    offensiveFoulsDrawn: 0,
    deflections: 0,
  };
  const makeTeamStats = (teamTotals, opponentTotals, possessions) => ({
    possessions,
    offensiveRating: possessions > 0 ? (safeNumber(teamTotals.points, 0) / possessions) * 100 : 0,
    defensiveRating: possessions > 0 ? (safeNumber(opponentTotals.points, 0) / possessions) * 100 : 0,
    netRating: possessions > 0 ? ((safeNumber(teamTotals.points, 0) - safeNumber(opponentTotals.points, 0)) / possessions) * 100 : 0,
    killsData: {
      three: 0,
      four: 0,
      five: 0,
      six: 0,
      seven: 0,
      eight: 0,
      delta: 0,
      pi: 0,
    },
    transitionStats: {
      transitionRate: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      secondChancePoints: 0,
      pointsOffTurnovers: 0,
      paintPoints: safeNumber(teamTotals.paintPoints, 0),
      transitionPossessions: 0,
      threePointORebPercent: 0,
    },
    shotProfile: {
      rimRate: teamTotals.fieldGoalsAttempted ? (teamTotals.rimFieldGoalsAttempted / teamTotals.fieldGoalsAttempted) * 100 : 0,
      midRate: 0,
      threePRate: teamTotals.fieldGoalsAttempted ? (teamTotals.threePointersAttempted / teamTotals.fieldGoalsAttempted) * 100 : 0,
    },
    shotEfficiency: {
      rimFGPercent: teamTotals.rimFieldGoalsAttempted ? (teamTotals.rimFieldGoalsMade / teamTotals.rimFieldGoalsAttempted) * 100 : 0,
      rimFGMade: teamTotals.rimFieldGoalsMade,
      rimFGAttempted: teamTotals.rimFieldGoalsAttempted,
      midFGPercent: 0,
      midFGMade: 0,
      midFGAttempted: 0,
      threeFGPercent: teamTotals.threePointersAttempted ? (teamTotals.threePointersMade / teamTotals.threePointersAttempted) * 100 : 0,
      threeFGMade: teamTotals.threePointersMade,
      threeFGAttempted: teamTotals.threePointersAttempted,
    },
    advancedStats: baseAdvanced,
  });
  return {
    home: makeTeamStats(homeTotals, awayTotals, homePossessions),
    away: makeTeamStats(awayTotals, homeTotals, awayPossessions),
  };
}

function buildBoxScoreTeam(teamSummary = {}, competitorStats = {}) {
  const players = Array.isArray(competitorStats.players) ? competitorStats.players.map(parsePlayerStats) : [];
  return {
    teamId: normalizeText(teamSummary.teamId),
    teamName: normalizeText(teamSummary.teamName),
    teamCity: normalizeText(teamSummary.teamCity),
    teamTricode: normalizeText(teamSummary.teamTricode),
    players,
    totals: parseTeamTotals(competitorStats.statistics || {}),
  };
}

async function fetchCompetitionsRaw() {
  const cacheKey = "all";
  if (competitionsCache.has(cacheKey)) return competitionsCache.get(cacheKey);
  const promise = requestJson(COMPETITIONS_URL)
    .then((payload) => (Array.isArray(payload.competitions) ? payload.competitions.map(normalizeCompetition) : []));
  competitionsCache.set(cacheKey, promise);
  return promise;
}

function isInternationalCompetition(competition) {
  return competition.categoryName === "International" || /world cup|eurobasket|olympic|americup|afrobasket|asia cup|friendly|qualification/i.test(competition.name);
}

function isMensWorldCup2027Competition(competition) {
  return MENS_WORLD_CUP_2027_COMPETITION_IDS.has(competition.id);
}

function compareCompetitionPriority(left, right) {
  const leftPriority = MENS_WORLD_CUP_2027_COMPETITION_PRIORITY.indexOf(left.id);
  const rightPriority = MENS_WORLD_CUP_2027_COMPETITION_PRIORITY.indexOf(right.id);
  const normalizedLeft = leftPriority === -1 ? Number.POSITIVE_INFINITY : leftPriority;
  const normalizedRight = rightPriority === -1 ? Number.POSITIVE_INFINITY : rightPriority;
  if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
  return left.name.localeCompare(right.name);
}

export async function fetchCompetitionOptions() {
  const competitions = await fetchCompetitionsRaw();
  return competitions
    .filter((competition) => (
      competition.gender === "men"
      && (isMensWorldCup2027Competition(competition) || isInternationalCompetition(competition))
    ))
    .sort(compareCompetitionPriority);
}

export async function fetchSeasonOptions(competitionId = DEFAULT_COMPETITION_ID) {
  const key = normalizeText(competitionId);
  if (!key) return [];
  if (seasonsCache.has(key)) return seasonsCache.get(key);
  const promise = requestJson(`${API_BASE}/competitions/${encodeURIComponent(key)}/seasons.json`)
    .then((payload) => (Array.isArray(payload.seasons) ? payload.seasons.map(normalizeSeason) : []))
    .then((seasons) => seasons.sort((left, right) => String(right.startDate).localeCompare(String(left.startDate))));
  seasonsCache.set(key, promise);
  return promise;
}

export async function resolveDefaultSeasonId(competitionId = DEFAULT_COMPETITION_ID) {
  if (DEFAULT_SEASON_ID) return DEFAULT_SEASON_ID;
  const seasons = await fetchSeasonOptions(competitionId);
  return seasons[0]?.id || "";
}

export async function fetchSeasonCompetitors(seasonId) {
  const key = normalizeText(seasonId);
  if (!key) return [];
  if (seasonCompetitorsCache.has(key)) return seasonCompetitorsCache.get(key);
  const promise = requestJson(`${API_BASE}/seasons/${encodeURIComponent(key)}/competitors.json`)
    .then((payload) => (Array.isArray(payload.season_competitors) ? payload.season_competitors : []))
    .then((competitors) => competitors.map((competitor) => {
      const entry = normalizeCompetitor(competitor);
      return {
        teamId: entry.teamId,
        tricode: entry.teamTricode,
        fullName: entry.teamName,
      };
    }))
    .then((teams) => teams.sort((left, right) => left.fullName.localeCompare(right.fullName)));
  seasonCompetitorsCache.set(key, promise);
  return promise;
}

async function fetchSeasonSummaries(seasonId) {
  const key = normalizeText(seasonId);
  if (!key) return [];
  if (seasonSummariesCache.has(key)) return seasonSummariesCache.get(key);
  const promise = requestJson(`${API_BASE}/seasons/${encodeURIComponent(key)}/summaries.json`)
    .then((payload) => (Array.isArray(payload.summaries) ? payload.summaries : []));
  seasonSummariesCache.set(key, promise);
  return promise;
}

async function fetchGameSummaryRaw(gameId) {
  const key = normalizeText(gameId);
  if (!key) throw new Error("Missing sport event id.");
  if (gameSummaryCache.has(key)) return gameSummaryCache.get(key);
  const promise = requestJson(`${API_BASE}/sport_events/${encodeURIComponent(key)}/summary.json`);
  gameSummaryCache.set(key, promise);
  return promise;
}

async function fetchGameTimelineRaw(gameId) {
  const key = normalizeText(gameId);
  if (!key) throw new Error("Missing sport event id.");
  if (gameTimelineCache.has(key)) return gameTimelineCache.get(key);
  const promise = requestJson(`${API_BASE}/sport_events/${encodeURIComponent(key)}/timeline.json`);
  gameTimelineCache.set(key, promise);
  return promise;
}

export async function fetchGamesByDate(dateStr, options = {}) {
  const seasonId = options.seasonId || await resolveDefaultSeasonId(options.competitionId || DEFAULT_COMPETITION_ID);
  const games = await fetchSeasonSummaries(seasonId);
  return games
    .map(normalizeScheduledGame)
    .filter((game) => game.gameDate === dateStr)
    .sort((left, right) => String(left.gameTimeUTC).localeCompare(String(right.gameTimeUTC)));
}

export async function fetchSeasonGameDates(seasonId) {
  const key = normalizeText(seasonId);
  if (!key) return [];
  const games = await fetchSeasonSummaries(key);
  return [...new Set(
    games
      .map((game) => parseDatePart(game?.sport_event?.start_time))
      .filter(Boolean)
  )].sort();
}

export async function fetchTeamSeasonGames(teamId, opponentTeamId = "", seasonId = "") {
  const resolvedSeasonId = seasonId || await resolveDefaultSeasonId(DEFAULT_COMPETITION_ID);
  const games = await fetchSeasonSummaries(resolvedSeasonId);
  const safeTeamId = normalizeText(teamId);
  const safeOpponentTeamId = normalizeText(opponentTeamId);
  return games
    .map(normalizeScheduledGame)
    .filter((game) => {
      const homeTeamId = normalizeText(game.homeTeam.teamId);
      const awayTeamId = normalizeText(game.awayTeam.teamId);
      const teamMatches = homeTeamId === safeTeamId || awayTeamId === safeTeamId;
      if (!teamMatches) return false;
      if (!safeOpponentTeamId) return true;
      return homeTeamId === safeOpponentTeamId || awayTeamId === safeOpponentTeamId;
    })
    .sort((left, right) => String(right.gameTimeUTC).localeCompare(String(left.gameTimeUTC)));
}

export async function fetchGame(gameId) {
  const [summaryPayload, timelinePayload] = await Promise.all([
    fetchGameSummaryRaw(gameId),
    fetchGameTimelineRaw(gameId).catch(() => null),
  ]);
  const sportEvent = summaryPayload.sport_event || {};
  const status = summaryPayload.sport_event_status || {};
  const { homeTeam, awayTeam } = parseSportEventTeams(sportEvent, status);
  const competitors = Array.isArray(summaryPayload.statistics?.totals?.competitors)
    ? summaryPayload.statistics.totals.competitors
    : [];
  const homeCompetitorStats = competitors.find((competitor) => competitor.qualifier === "home") || {};
  const awayCompetitorStats = competitors.find((competitor) => competitor.qualifier === "away") || {};
  const boxScore = {
    home: buildBoxScoreTeam(homeTeam, homeCompetitorStats),
    away: buildBoxScoreTeam(awayTeam, awayCompetitorStats),
  };
  const timeline = Array.isArray(timelinePayload?.timeline) ? timelinePayload.timeline : [];
  const playByPlayActions = timeline
    .filter((event) => !["match_started", "match_ended", "period_start", "period_score", "break_start", "timeout_over"].includes(event.type))
    .map((event) => mapTimelineAction(event, { homeTeam, awayTeam }))
    .sort((left, right) => left.orderNumber - right.orderNumber);
  const lastPlayableEvent = [...timeline]
    .reverse()
    .find((event) => safeNumber(event.period, 0) > 0 || periodNameToNumber(event.period_name) > 0);
  const currentPeriod = safeNumber(status.period_scores?.length, 0)
    || safeNumber(lastPlayableEvent?.period, periodNameToNumber(lastPlayableEvent?.period_name));
  const gameClock = lastPlayableEvent?.match_clock
    ? elapsedClockToRemainingIso(lastPlayableEvent.match_clock, currentPeriod || 1)
    : "PT0M0.00S";
  const teamStats = buildTeamStats(boxScore.home.totals, boxScore.away.totals);
  return {
    gameId: normalizeText(sportEvent.id),
    gameCode: "",
    gameStatus: mapGameStatus(status.status),
    gameStatusText: normalizeText(status.match_status || status.status),
    period: currentPeriod,
    gameClock,
    gameTimeUTC: normalizeText(sportEvent.start_time),
    gameEt: normalizeText(sportEvent.start_time),
    seasonYear: normalizeText(sportEvent.sport_event_context?.season?.year),
    seasonType: normalizeText(sportEvent.sport_event_context?.competition?.name),
    arena: {
      arenaName: normalizeText(sportEvent.venue?.name),
      arenaState: "",
      arenaCity: normalizeText(sportEvent.venue?.city_name),
    },
    homeTeam,
    awayTeam,
    officials: [],
    callsAgainst: null,
    timeouts: {
      home: safeNumber(homeCompetitorStats.statistics?.timeouts, 0),
      away: safeNumber(awayCompetitorStats.statistics?.timeouts, 0),
    },
    challenges: {
      home: { challengesTotal: 1, challengesWon: 0 },
      away: { challengesTotal: 1, challengesWon: 0 },
    },
    playByPlayActions,
    teamStats,
    boxScore,
    competition: normalizeText(sportEvent.sport_event_context?.competition?.name),
    competitionId: normalizeText(sportEvent.sport_event_context?.competition?.id),
    regulationPeriodSeconds: REGULATION_PERIOD_SECONDS,
  };
}

export async function fetchMinutes(gameId) {
  const game = await fetchGame(gameId);
  return {
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    periods: [],
    playerTotals: {
      home: game.boxScore?.home?.players || [],
      away: game.boxScore?.away?.players || [],
    },
  };
}

export function teamLogoUrl(teamId) {
  const team = getRegisteredTeam(teamId);
  if (team?.logoUrl) return team.logoUrl;
  return buildLogoDataUri(normalizeText(teamId).slice(-4) || "FIBA");
}

export function inferLeagueFromTeamId() {
  return "fiba";
}

export function isSummerLeagueGame() {
  return false;
}

export function playerHeadshotUrls() {
  return [];
}

export function playerHeadshotUrl() {
  return null;
}

export async function fetchCurrentNbaRosters() {
  return [];
}

export async function fetchCurrentGLeagueRosters() {
  return [];
}

export function nbaEventVideoUrl() {
  return null;
}

export const FIBA_DEFAULT_COMPETITION_ID = DEFAULT_COMPETITION_ID;
