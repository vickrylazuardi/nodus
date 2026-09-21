import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library leaves mounted trees behind between tests otherwise,
// which causes duplicate-element queries in later tests.
afterEach(() => {
  cleanup();
});
