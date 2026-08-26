# frozen_string_literal: true

require "herb/engine/slot_visitor"

ReActionView.config.intercept_erb = true
ReActionView.config.debug_mode = false

ReActionView.config.transform_visitors << lambda do |_template, source|
  mode = Herb::Engine::SlotVisitor.directive_mode(source)
  Herb::Engine::SlotVisitor.new(mode: mode) if mode
end
