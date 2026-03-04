import type { Jurisdiction } from "../types.js";

/** Demo investors for the vault platform */
export const SEED_INVESTORS: Array<{
  name: string;
  email: string;
  jurisdiction: Jurisdiction;
  accredited: boolean;
}> = [
  {
    name: "Tanaka Hiroshi",
    email: "tanaka@example.jp",
    jurisdiction: "FSA",
    accredited: true,
  },
  {
    name: "Lim Wei Ting",
    email: "limwt@example.sg",
    jurisdiction: "MAS",
    accredited: false,
  },
  {
    name: "Chan Ka Ming",
    email: "chanKM@example.hk",
    jurisdiction: "SFC",
    accredited: true,
  },
];
