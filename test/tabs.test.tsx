// @vitest-environment jsdom
import { useState } from "react";
import { act } from "preact/test-utils";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TabPanel, Tabs } from "../src/components/Tabs.js";

const TABS = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Harness(): ReactNode {
  const [active, setActive] = useState<TabId>("one");
  return (
    <>
      <Tabs
        label="Example views"
        idPrefix="example"
        tabs={TABS}
        active={active}
        onChange={setActive}
      />
      {TABS.map((tab) => (
        <TabPanel key={tab.id} idPrefix="example" id={tab.id} active={active}>
          {tab.label} panel
        </TabPanel>
      ))}
    </>
  );
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  void act(() => {
    root.render(<Harness />);
  });
});

afterEach(() => {
  void act(() => {
    root.unmount();
  });
  container.remove();
});

function tab(id: TabId): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(
    `#example-tab-${id}`,
  );
  if (found === null) throw new Error(`Missing tab ${id}`);
  return found;
}

function press(target: HTMLElement, key: string): void {
  void act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  });
}

function selected(): string | undefined {
  return container.querySelector("[aria-selected='true']")?.id;
}

describe("Tabs", () => {
  it("links each tab to its panel and keeps one tab in the tab order", () => {
    expect(container.querySelector("[role='tablist']")?.ariaLabel).toBe(
      "Example views",
    );
    expect(tab("two").getAttribute("aria-controls")).toBe("example-panel-two");
    expect(
      container
        .querySelector("#example-panel-two")
        ?.getAttribute("aria-labelledby"),
    ).toBe("example-tab-two");
    expect(TABS.map(({ id }) => tab(id).tabIndex)).toEqual([0, -1, -1]);
  });

  it("jumps to the ends with Home and End", () => {
    press(tab("one"), "End");
    expect(selected()).toBe("example-tab-three");
    expect(document.activeElement).toBe(tab("three"));
    expect(TABS.map(({ id }) => tab(id).tabIndex)).toEqual([-1, -1, 0]);

    press(tab("three"), "Home");
    expect(selected()).toBe("example-tab-one");
    expect(document.activeElement).toBe(tab("one"));
  });

  it("wraps arrow keys and ignores other keys", () => {
    press(tab("one"), "ArrowLeft");
    expect(selected()).toBe("example-tab-three");
    press(tab("three"), "ArrowRight");
    expect(selected()).toBe("example-tab-one");
    press(tab("one"), "ArrowDown");
    expect(selected()).toBe("example-tab-one");
  });

  it("shows only the active panel", () => {
    void act(() => {
      tab("two").click();
    });
    const hidden = Array.from(
      container.querySelectorAll<HTMLElement>("[role='tabpanel']"),
    ).map((panel) => panel.hidden);
    expect(hidden).toEqual([true, false, true]);
  });
});
