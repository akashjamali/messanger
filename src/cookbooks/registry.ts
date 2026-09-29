export const COOKBOOK_IDS = ["fable"] as const;
export type CookbookId = (typeof COOKBOOK_IDS)[number];
export const COOKBOOKS = [
  {
    id: "fable",
    title: "Cookbook 1 (Fable)",
    description:
      "A folding story rail, glass portraits, and an ink-and-paper conversation.",
    route: "/fable",
  },
] as const;
