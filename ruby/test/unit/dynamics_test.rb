# frozen_string_literal: true

require "test_helper"

class DynamicsTest < TestCase
  include ViewComponent::TestHelpers

  test "directive component gains render_dynamics with payload shape" do
    render_inline(DynamicsCounterComponent.new(count: 41))

    assert DynamicsCounterComponent.dynamics_capable?

    component = DynamicsCounterComponent.new(count: 41)
    render_inline(component)
    component.instance_variable_set(:@_herb_region_occurrences, nil)
    payload = component.render_dynamics

    assert_equal 0, payload[:occurrence]
    assert payload[:template].end_with?("dynamics_counter_component.html.erb")
    assert_match(/\A\h+\z/, payload[:version])
    assert_includes payload[:slots].values.map(&:to_s), "41"
  end

  test "non-directive component is not dynamics capable" do
    refute LiveComponent::RenderComponent.dynamics_capable?
  end
end
