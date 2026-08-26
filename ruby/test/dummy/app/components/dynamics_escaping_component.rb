# frozen_string_literal: true

class DynamicsEscapingComponent < ViewComponent::Base
  include LiveComponent::Base

  attr_reader :text, :safe_html

  def initialize(text:, safe_html:)
    @text = text
    @safe_html = safe_html
  end
end
