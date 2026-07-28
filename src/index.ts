import { defineProvider } from "../core-auth/dist/index.js";
import { driver } from "./driver.js";

export const CustomProvider = defineProvider(driver as never).opencode;
