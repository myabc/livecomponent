import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { TestContext, testSetup } from "./test-helpers/setup";
import { SlotsLike } from "./application";
import { SlotsResponse, SuccessResponse, State } from "./live-component";

const make_slots = (behavior: { report?: { applied: number; deferred: unknown[]; token?: number }, throws?: Error }): SlotsLike => ({
  apply: vi.fn(() => {
    if (behavior.throws) throw behavior.throws;
    return behavior.report!;
  }),
  revert: vi.fn(() => true),
});

const slots_response = (count: number): SlotsResponse => ({
  success: true,
  state: { props: { count }, slots: {}, children: {} },
  dynamics: { template: "t.html.erb", version: "abc", occurrence: 0, slots: { 0: String(count) } },
});

const html_response = (state: State): SuccessResponse => ({
  success: true,
  body: `<live-component data-livecomponent="true" data-state='${JSON.stringify(state)}'><div>html</div></live-component>`,
});

describe("LiveComponent", () => {
  let testContext: TestContext;

  beforeAll(() => {
    testContext = testSetup();
  });

  describe("render", () => {
    it("fetches a result from the server and updates the DOM", async () => {
      const component = await testContext.make_component(null, () => {
        return "<div attribute='original value'>original content</div>";
      });

      await component.render(null, () => {
        return "<div attribute='updated value'>updated content</div>";
      });

      const childDiv = component.querySelector("div");
      expect(childDiv?.getAttribute("attribute")).toBe("updated value");
      expect(childDiv?.textContent).toBe("updated content");
    });

    it("updates state", async () => {
      const state = testContext.make_state();
      state.props.foo = "bar";

      const component = await testContext.make_component(state, () => {
        return "<div attribute='value'>content</div>";
      });

      expect(component.state.props).toStrictEqual({foo: "bar"});

      state.props.foo = "baz";
      expect(component.state.props).toStrictEqual({foo: "bar"});
      await component.render(state);
      expect(component.state.props).toStrictEqual({foo: "baz"});
    });

    it("propagates state to child components", async () => {
      const state = testContext.make_state();
      state.props.parent_prop = "parent prop value";
      state.children["abc123"] = testContext.make_state();
      state.children["abc123"].props = { child_prop: "child prop value" };

      const component = await testContext.make_component(state, () => {
        const child = testContext.make_component_element();
        child.setAttribute("data-id", "abc123");
        return child.outerHTML;
      });

      expect(component.state.props).toStrictEqual({parent_prop: "parent prop value"});
      expect(component.state.children["abc123"].props).toStrictEqual({child_prop: "child prop value"});
    });

    it("calls before_node_morphed before the node is replaced", async () => {
      const component_wrapper = await testContext.make_component(null, () => {
        return "<div attribute='value'>content</div>";
      });

      const morph_mock = vi.fn();
      component_wrapper.component.before_node_morphed = morph_mock;

      await component_wrapper.render(null, () => {
        return "<div attribute='updated value'>updated content</div>";
      });

      expect(morph_mock).toHaveBeenCalled();
    });

    it("morphs the node if before_node_morph returns true", async () => {
      const component_wrapper = await testContext.make_component(null, () => {
        return "<div attribute='value'>content</div>";
      });

      const morph_mock = vi.fn(() => true);
      component_wrapper.component.before_node_morphed = morph_mock;

      await component_wrapper.render(null, () => {
        return "<div attribute='updated value'>updated content</div>";
      });

      const div = component_wrapper.querySelector("div");
      expect(div.getAttribute("attribute")).toStrictEqual("updated value");
      expect(div.textContent).toStrictEqual("updated content");
    });

    it("does not morph the node if before_node_morphed returns false", async () => {
      const component_wrapper = await testContext.make_component(null, () => {
        return "<div attribute='value'>content</div>";
      });

      const morph_mock = vi.fn(() => false);
      component_wrapper.component.before_node_morphed = morph_mock;

      await component_wrapper.render(null, () => {
        return "<div attribute='updated value'>updated content</div>";
      });

      expect(morph_mock).toHaveBeenCalled();

      const div = component_wrapper.querySelector("div");
      expect(div.getAttribute("attribute")).toStrictEqual("value");
      expect(div.textContent).toStrictEqual("content");
    });
  });

  describe("render with slots", () => {
    afterEach(() => { testContext.liveApp.slots = null; });

    it("applies dynamics and propagates envelope state without morphing", async () => {
      const slots = make_slots({ report: { applied: 1, deferred: [] } });
      testContext.liveApp.slots = slots;
      const component = await testContext.make_component(null, () => "<div>orig</div>");
      vi.mocked(testContext.transport.render).mockResolvedValue(slots_response(6));

      await component.component.render(TestContext.make_request());

      expect(slots.apply).toHaveBeenCalledWith(slots_response(6).dynamics);
      expect(testContext.transport.render).toHaveBeenCalledTimes(1);
      expect(vi.mocked(testContext.transport.render).mock.calls[0][0].format).toBe("slots");
      const controller = await component.component.controller;
      expect(controller.state.props).toStrictEqual({ count: 6 });
      expect(component.component.querySelector("div")?.textContent).toBe("orig");
    });

    it("reverts and falls back to HTML on a deferred report with a token", async () => {
      const slots = make_slots({ report: { applied: 1, deferred: [{ reason: "branch" }], token: 7 } });
      testContext.liveApp.slots = slots;
      const component = await testContext.make_component(null, () => "<div>orig</div>");
      const envelope = slots_response(6);
      vi.mocked(testContext.transport.render)
        .mockResolvedValueOnce(envelope)
        .mockResolvedValueOnce(html_response(envelope.state));

      await component.component.render(TestContext.make_request());

      expect(slots.revert).toHaveBeenCalledWith(7);
      expect(testContext.transport.render).toHaveBeenCalledTimes(2);
      const fallback_request = vi.mocked(testContext.transport.render).mock.calls[1][0];
      expect(fallback_request.reflexes).toStrictEqual([]);
      expect(fallback_request.format).toBe("html");
      expect(fallback_request.state).toStrictEqual(envelope.state);
      expect(component.component.querySelector("div")?.textContent).toBe("html");
    });

    it("skips revert when the deferred report has no token", async () => {
      const slots = make_slots({ report: { applied: 0, deferred: [{ reason: "branch" }] } });
      testContext.liveApp.slots = slots;
      const component = await testContext.make_component(null, () => "<div>orig</div>");
      const envelope = slots_response(6);
      vi.mocked(testContext.transport.render)
        .mockResolvedValueOnce(envelope)
        .mockResolvedValueOnce(html_response(envelope.state));

      await component.component.render(TestContext.make_request());

      expect(slots.revert).not.toHaveBeenCalled();
      expect(testContext.transport.render).toHaveBeenCalledTimes(2);
    });

    it("falls back to HTML without revert when apply throws", async () => {
      const slots = make_slots({ throws: new Error("boom") });
      testContext.liveApp.slots = slots;
      const component = await testContext.make_component(null, () => "<div>orig</div>");
      const envelope = slots_response(6);
      vi.mocked(testContext.transport.render)
        .mockResolvedValueOnce(envelope)
        .mockResolvedValueOnce(html_response(envelope.state));

      await component.component.render(TestContext.make_request());

      expect(slots.revert).not.toHaveBeenCalled();
      expect(component.component.querySelector("div")?.textContent).toBe("html");
    });

    it("uses the plain HTML path when no slots are configured", async () => {
      const component = await testContext.make_component(null, () => "<div>orig</div>");
      vi.mocked(testContext.transport.render).mockResolvedValue(html_response(TestContext.make_state()));

      await component.component.render(TestContext.make_request());

      expect(vi.mocked(testContext.transport.render).mock.calls[0][0].format).toBeUndefined();
      expect(component.component.querySelector("div")?.textContent).toBe("html");
    });
  });
});
