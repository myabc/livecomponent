# frozen_string_literal: true

class PlainCounterComponent < ViewComponent::Base
  include LiveComponent::Base

  attr_reader :count

  def initialize(count: 0)
    @count = count
  end

  def increment
    @count += 1
  end
end
