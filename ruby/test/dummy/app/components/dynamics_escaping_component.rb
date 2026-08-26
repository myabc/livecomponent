# frozen_string_literal: true

class DynamicsEscapingComponent < ViewComponent::Base
  include LiveComponent::Base

  attr_reader :text, :safe_html, :css_class, :safe_attr

  def initialize(text:, safe_html:, css_class:, safe_attr:)
    @text = text
    @safe_html = safe_html
    @css_class = css_class
    @safe_attr = safe_attr
  end
end
