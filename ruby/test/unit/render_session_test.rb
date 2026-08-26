# frozen_string_literal: true

require "test_helper"

class RenderSessionTest < TestCase
  def counter_state
    {
      "ruby_class" => "DynamicsCounterComponent",
      "props" => { "count" => 5 },
      "slots" => {},
      "children" => {},
    }
  end

  test "returns html, post-reflex state, and dynamics" do
    result = LiveComponent::RenderSession.call(
      state: counter_state,
      reflexes: [{ "method_name" => "increment", "props" => {} }]
    )

    assert_includes result.html, "herb-region"
    assert_equal 6, result.state.dig("props", "count")
    assert_equal 0, result.dynamics[:occurrence]
    assert_includes result.dynamics[:slots].values.map(&:to_s), "6"
  end

  test "dispatches each reflex exactly once" do
    result = LiveComponent::RenderSession.call(
      state: counter_state,
      reflexes: [
        { "method_name" => "increment", "props" => {} },
        { "method_name" => "increment", "props" => {} },
      ]
    )

    # Two reflexes, each incrementing by 1, from a starting count of 5: 7 if
    # each ran exactly once, 9 if either ran twice.
    assert_equal 7, result.state.dig("props", "count")
  end

  test "dynamics is nil for dynamics-incapable components" do
    result = LiveComponent::RenderSession.call(
      state: {
        "ruby_class" => "PlainCounterComponent",
        "props" => { "count" => 5 },
        "slots" => {},
        "children" => {},
      },
      reflexes: []
    )

    assert_nil result.dynamics
    assert result.html.present?
  end

  test "escaping parity between html render and dynamics values" do
    state = {
      "ruby_class" => "DynamicsEscapingComponent",
      "props" => {
        "text" => %(<b>&"bold"</b>),
        "safe_html" => "<i>em</i>",
        "css_class" => %(foo&bar),
        "safe_attr" => "<raw>",
      },
      "slots" => {},
      "children" => {},
    }

    result = LiveComponent::RenderSession.call(state: state, reflexes: [])
    values = result.dynamics[:slots].values.map(&:to_s)

    # The escaped text value must appear in dynamics exactly as the HTML
    # rendered it (entity-escaped), and the html_safe value unescaped.
    assert_includes result.html, "&lt;b&gt;"
    assert values.any? { |v| v.include?("&lt;b&gt;") },
           "dynamics text value not escaped like the HTML render: #{values.inspect}"
    assert values.any? { |v| v.include?("<i>em</i>") },
           "dynamics html_safe value lost its markup: #{values.inspect}"

    # Same parity for an attribute-value expression: plain attribute values
    # escape, an html_safe attribute value passes through unescaped.
    assert_includes result.html, "foo&amp;bar"
    assert values.any? { |v| v.include?("foo&amp;bar") },
           "dynamics attribute value not escaped like the HTML render: #{values.inspect}"
    assert_includes result.html, "<raw>"
    assert values.any? { |v| v.include?("<raw>") },
           "dynamics html_safe attribute value lost its markup: #{values.inspect}"
  end
end
