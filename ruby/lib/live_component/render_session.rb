# frozen_string_literal: true

module LiveComponent
  class RenderSession
    Result = Struct.new(:html, :state, :dynamics, keyword_init: true)

    def self.call(state:, reflexes:)
      render_component = RenderComponent.new(state, reflexes)
      html = RenderController.renderer.render(render_component, layout: false)

      component = render_component.component
      serialized_state = JSON.parse(component.__lc_rendered_state.to_json)

      dynamics =
        if component.class.dynamics_capable?
          # The HTML render above already counted this template's occurrence
          # on the instance; reset so dynamics reports the same zero-based
          # occurrence the page's markers carry.
          component.instance_variable_set(:@_herb_region_occurrences, nil)
          component.render_dynamics
        end

      Result.new(html: html, state: serialized_state, dynamics: dynamics)
    end
  end
end
