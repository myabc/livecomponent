import { Idiomorph } from "idiomorph";
import { ComponentBuilder } from "./component-builder";
import { LiveController } from "./live-controller";
import { Application, SlotsLike } from "./application";
import { Task } from "./queue";
import { render_error_dialog } from "./error-dialog";

export type Props<T = {[key: string]: any}> = T;
export type SlotDefs = Record<string, Props>;
export type Block = (builder: ComponentBuilder) => string | void;
export type Reflex<P extends Props = Props> = {
  method_name: string,
  props: P
}

export type State<P extends Props = Props> = {
  ruby_class?: string
  props: P
  content?: string
  slots: {
    [key: string]: State[]
  }
  children: {
    [key: string]: State
  }
}

export class LiveComponent<P extends Props = Props, SL extends SlotDefs = SlotDefs> extends HTMLElement {
  public controller: Promise<LiveController<P, SL>>;

  // non-async way of getting the controller; shold only be used by event handlers
  // and such that cannot be async
  public _controller: LiveController<P, SL> | null = null;

  // assigned async in the constructor
  private resolve_controller!: (controller: LiveController<P, SL>) => void;

  constructor() {
    super();

    this._controller = null;
    this.controller = new Promise((resolve: (controller: LiveController<P, SL>) => void) => {
      this.resolve_controller = resolve;
    });
  }

  set_controller(controller: LiveController<P, SL>) {
    this.resolve_controller(controller);
    this._controller = controller;
  }

  before_node_morphed(_old_node: HTMLElement, _new_node: HTMLElement): boolean {
    return true;
  }

  get parent(): LiveComponent | null {
    const parent_el = this.parentElement;
    return parent_el?.closest("[data-livecomponent]") ?? null;
  }

  async render(request: RenderRequest, task?: Task<any>) {
    const controller = await this.controller;
    if (task?.canceled) return;

    const app = await Application.instance;
    const slots = app.slots;
    const response = await app.render(slots ? { ...request, format: "slots" } : request);
    if (task?.canceled) return;

    if (!response.success) {
      this.show_error_dialog(response as ErrorResponse);
      return;
    }

    if ("dynamics" in response) {
      if (this.apply_dynamics(slots!, response)) {
        controller.propagate_state(response.state as State<P>);
        return;
      }

      const fallback = await app.render({ state: response.state, reflexes: [], format: "html" });
      if (task?.canceled) return;

      if (!fallback.success) {
        this.show_error_dialog(fallback as ErrorResponse);
        return;
      }

      this.morph_html(fallback as SuccessResponse, controller);
      return;
    }

    this.morph_html(response as SuccessResponse, controller);
  }

  private show_error_dialog(response: ErrorResponse) {
    const error_dialog_html = render_error_dialog(response);
    const error_dialog = document.createElement("div");
    error_dialog.innerHTML = error_dialog_html;
    document.body.appendChild(error_dialog);
    (error_dialog.querySelector("dialog") as HTMLDialogElement).showModal();
  }

  private morph_html(response: SuccessResponse, controller: LiveController<P, SL>) {
    const el = document.createElement("div");
    el.innerHTML = response.body;
    const first_child = el.querySelector("[data-livecomponent]") as LiveComponent;
    const new_state = JSON.parse(first_child.getAttribute("data-state") ?? "{}");
    first_child.removeAttribute("data-state");

    Idiomorph.morph(this, first_child, {
      callbacks: {
        beforeNodeMorphed: (oldNode: HTMLElement, newNode: HTMLElement) => {
          if (oldNode instanceof LiveComponent) {
            return oldNode.before_node_morphed(oldNode, newNode);
          }

          return true;
        }
      }
    });

    controller.propagate_state(new_state);
  }

  // Returns false when the payload could not be fully applied; a partial
  // apply is reverted when a token exists, and a thrown apply has no token
  // to revert, so the HTML fallback repairs whatever was written.
  private apply_dynamics(slots: SlotsLike, response: SlotsResponse): boolean {
    let report;

    try {
      report = slots.apply(response.dynamics);
    } catch (e) {
      console.warn("[LiveComponent] slots.apply threw, falling back to HTML", e);
      return false;
    }

    if (report.deferred.length === 0) return true;

    if (report.token != null) slots.revert(report.token);
    return false;
  }
}

declare global {
  interface Window {
    LiveComponent: typeof LiveComponent
  }
}

if (!window.customElements.get('live-component')) {
  window.LiveComponent = LiveComponent;
  window.customElements.define('live-component', LiveComponent);
}

export type RenderRequest = {
  state: State
  reflexes: Reflex[]
  format?: "slots" | "html"
}

export type ErrorResponseStatus = "server-error" | "client-error"
export type ResponseStatus = ErrorResponseStatus | "success" | "unknown";

export type SuccessResponse = {
  success: true
  body: string
}

export type SlotsResponse = {
  success: true
  state: State
  dynamics: unknown
}

export type ErrorResponse = {
  success: false
  status: ErrorResponseStatus | "unknown"
  body: string
  message: string | null
  backtrace?: string[]
}

export type RenderResponse = SuccessResponse | SlotsResponse | ErrorResponse;
