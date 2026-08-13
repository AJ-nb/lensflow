export const THEME_IDS = [
  "cinnabar-celadon",
  "mineral-gold",
  "indigo-coral",
  "ink-neon",
  "lacquer-pop",
  "woodblock-clash"
] as const;

export type ThemeId = typeof THEME_IDS[number];
export type ThemeMode = "daily" | "manual";

export interface VisualTheme {
  id: ThemeId;
  label: string;
  description: string;
  colors: readonly [string, string, string, string];
}

export const VISUAL_THEMES: readonly VisualTheme[] = [
  {
    id: "cinnabar-celadon",
    label: "朱砂青瓷",
    description: "印章朱红与青瓷冷绿，叠加细密回纹",
    colors: ["#B9362B", "#2F7773", "#F4F7F2", "#202724"]
  },
  {
    id: "mineral-gold",
    label: "石青飞金",
    description: "矿物蓝撞明黄，以屏风分割形成节奏",
    colors: ["#1858A8", "#F1BE2B", "#F6F3EA", "#20232A"]
  },
  {
    id: "indigo-coral",
    label: "靛蓝珊瑚",
    description: "传统靛染与珊瑚橙，结合织物斜纹",
    colors: ["#243B72", "#F06449", "#F5F5F1", "#202533"]
  },
  {
    id: "ink-neon",
    label: "墨拓荧黄",
    description: "拓印黑与荧光黄，使用前卫断裂网格",
    colors: ["#222222", "#D7F12B", "#F5F5F2", "#181A18"]
  },
  {
    id: "lacquer-pop",
    label: "漆黑桃红",
    description: "大漆黑、桃红与湖蓝构成波普网点",
    colors: ["#C72C68", "#168C9E", "#F8F5F4", "#241F22"]
  },
  {
    id: "woodblock-clash",
    label: "套色木刻",
    description: "木刻红蓝套色，保留错版与切线张力",
    colors: ["#C64034", "#315DA8", "#F4F0E8", "#272522"]
  }
] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function dailyThemeId(date = new Date()): ThemeId {
  const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 2166136261;
  for (const character of dateKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return THEME_IDS[(hash >>> 0) % THEME_IDS.length]!;
}

export function resolveTheme(mode: ThemeMode, selected: ThemeId, date = new Date()): VisualTheme {
  const id = mode === "daily" ? dailyThemeId(date) : selected;
  return VISUAL_THEMES.find((theme) => theme.id === id) ?? VISUAL_THEMES[0]!;
}

export function randomThemeId(current: ThemeId, random = Math.random): ThemeId {
  const alternatives = THEME_IDS.filter((id) => id !== current);
  return alternatives[Math.floor(random() * alternatives.length)] ?? THEME_IDS[0];
}
