import { useColorScheme } from "react-native";
import { useFable } from "../data/store";

import { Palette, type Scheme, type Theme } from "../constants/theme";

export function useScheme(): Scheme {
  const s = useColorScheme();
  const preference = useFable((state) => state.theme);
  if (preference === "dark") return "dark";
  if (preference === "system") return s === "dark" ? "dark" : "light";
  return "light";
}

export function useTheme(): Theme {
  return Palette[useScheme()];
}
