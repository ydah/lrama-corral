const DEFAULT_MARGIN = 70;
const DEFAULT_LEVEL_GAP = 220;
const DEFAULT_MIN_WIDTH = 1200;
const DEFAULT_MIN_HEIGHT = 600;
const DEFAULT_DISCONNECTED_PER_LEVEL = 5;

export function calculateStateGraphLayout(stateTransitions, options = {}) {
  const states = Array.isArray(stateTransitions) ? stateTransitions : [];
  const nodeRadius = options.nodeRadius ?? 30;
  const margin = options.margin ?? DEFAULT_MARGIN;
  const rowGap = options.rowGap ?? Math.max(nodeRadius * 2 + 30, 90);
  const levelGap = options.levelGap ?? DEFAULT_LEVEL_GAP;
  const disconnectedPerLevel = options.disconnectedPerLevel ?? DEFAULT_DISCONNECTED_PER_LEVEL;

  if (states.length === 0) {
    return {
      width: options.minWidth ?? DEFAULT_MIN_WIDTH,
      height: options.minHeight ?? DEFAULT_MIN_HEIGHT,
      positions: {},
    };
  }

  const levels = calculateStateLevels(states, disconnectedPerLevel);
  const levelGroups = groupStatesByLevel(levels);
  const maxLevel = Math.max(...Object.values(levels));
  const maxGroupSize = Math.max(...Object.values(levelGroups).map(group => group.length));
  const width = Math.max(options.minWidth ?? DEFAULT_MIN_WIDTH, margin * 2 + Math.max(1, maxLevel) * levelGap);
  const height = Math.max(options.minHeight ?? DEFAULT_MIN_HEIGHT, margin * 2 + Math.max(1, maxGroupSize - 1) * rowGap);
  const levelSpan = maxLevel === 0 ? 0 : (width - margin * 2) / maxLevel;
  const positions = {};

  Object.entries(levelGroups).forEach(([level, stateIds]) => {
    const levelNumber = Number(level);
    const x = maxLevel === 0 ? width / 2 : margin + levelNumber * levelSpan;
    const groupHeight = (stateIds.length - 1) * rowGap;
    const startY = height / 2 - groupHeight / 2;

    stateIds.forEach((stateId, index) => {
      positions[stateId] = {
        x,
        y: startY + index * rowGap,
      };
    });
  });

  return { width, height, positions };
}

function calculateStateLevels(stateTransitions, disconnectedPerLevel) {
  const statesById = new Map(stateTransitions.map(state => [state.id, state]));
  const startStateId = statesById.has(0) ? 0 : stateTransitions[0].id;
  const levels = { [startStateId]: 0 };
  const visited = new Set([startStateId]);
  const queue = [startStateId];

  while (queue.length > 0) {
    const stateId = queue.shift();
    const state = statesById.get(stateId);
    if (!state) continue;

    const currentLevel = levels[stateId];
    getStateDestinations(state).forEach(destination => {
      if (!statesById.has(destination) || visited.has(destination)) return;
      visited.add(destination);
      levels[destination] = currentLevel + 1;
      queue.push(destination);
    });
  }

  const visitedMaxLevel = Math.max(...Object.values(levels));
  let disconnectedIndex = 0;
  stateTransitions.forEach(state => {
    if (visited.has(state.id)) return;
    levels[state.id] = visitedMaxLevel + Math.floor(disconnectedIndex / disconnectedPerLevel) + 1;
    disconnectedIndex += 1;
  });

  return levels;
}

function groupStatesByLevel(levels) {
  return Object.entries(levels).reduce((groups, [stateId, level]) => {
    if (!groups[level]) groups[level] = [];
    groups[level].push(Number(stateId));
    groups[level].sort((a, b) => a - b);
    return groups;
  }, {});
}

function getStateDestinations(state) {
  return [
    ...(state.shifts || []).map(transition => transition.to_state),
    ...(state.gotos || []).map(transition => transition.to_state),
  ];
}
