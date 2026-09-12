import type { Snapshot } from "../shared/domain.js";
import { keys } from "../shared/domain.js";
export const sample = (age = 28): Snapshot => ({
  profile: {
    adult: true,
    values: {
      age,
      city: "杭州",
      goal: "认真交往",
      smoking: "不吸烟",
      communication: 3,
      children: "希望育儿",
      finance: "按比例分担",
      interests: ["阅读", "旅行"],
    },
  },
  preferences: {
    values: {
      age: {
        importance: "prefer",
        weight: 1,
        allowUnknown: true,
        accepted: [],
        min: 25,
        max: 35,
      },
      goal: {
        importance: "must",
        weight: 1,
        allowUnknown: true,
        accepted: ["认真交往"],
      },
      smoking: {
        importance: "must",
        weight: 1,
        allowUnknown: false,
        accepted: ["不吸烟"],
      },
      communication: {
        importance: "flexible",
        weight: 1,
        allowUnknown: true,
        accepted: [],
        min: 2,
        max: 4,
      },
      children: {
        importance: "must",
        weight: 1,
        allowUnknown: true,
        accepted: ["希望育儿"],
      },
      interests: {
        importance: "prefer",
        weight: 1,
        allowUnknown: true,
        accepted: ["阅读"],
      },
    },
  },
  fields: [...keys],
  profileVersion: 1,
  preferenceVersion: 1,
  consentVersion: 1,
  ai: true,
});
