// Recharts draws SVG with presentation attributes, which can't read CSS
// variables reliably, so chart colours are mirrored here per theme.
export const CHART_THEMES = {
  paper: {
    sheet: "#ffffff",
    data: "#1f4e79",
    mark: "#e2b93b",
    other: "#a9b6c0",
    grid: "#e4ebe8",
    axis: "#5e6d7b",
    text: "#1b2a3a",
    mean: "#b42318",
    median: "#1b2a3a",
    palette: ["#1f4e79", "#5b8fc2", "#a8c7e6", "#c9a227", "#3e7c6b", "#8a6db0", "#b5603c", "#6e7c89"],
  },
  blueprint: {
    sheet: "#12243d",
    data: "#8fbbe8",
    mark: "#f4d35e",
    other: "#4a6488",
    grid: "#1c365c",
    axis: "#8ea4bc",
    text: "#e4ecf5",
    mean: "#ff9b8c",
    median: "#e4ecf5",
    palette: ["#8fbbe8", "#4f86c6", "#c9dcf2", "#f4d35e", "#6fc2a6", "#b9a2e0", "#f0a07c", "#8ea4bc"],
  },
};

export const chartTheme = (theme) => CHART_THEMES[theme] ?? CHART_THEMES.paper;
