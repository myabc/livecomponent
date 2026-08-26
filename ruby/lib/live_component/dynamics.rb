# frozen_string_literal: true

begin
  require "herb/engine/slot_visitor"
  require "herb/engine/dynamics_compiler"
rescue LoadError
  nil
end

module LiveComponent
  module Dynamics
    # Mirrors `ActionView::OutputBuffer#<<`, the method ReActionView's Herb engine routes a plain
    # `<%= %>` through: pass an already-`html_safe?` value through unescaped, otherwise HTML-escape
    # it. `Herb::Engine.h` (the compiler's own default) always escapes regardless of `html_safe?`,
    # which would desync a dynamics value from the markup the same template just rendered.
    def self.h(value)
      value = value.to_s
      value.html_safe? ? value : CGI.escapeHTML(value)
    end

    def self.compile(component_class, source, path)
      return unless defined?(Herb::Engine::DynamicsCompiler)
      return unless Herb::Engine::SlotVisitor.directive_mode(source)

      src = Herb::Engine::DynamicsCompiler.new(
        source,
        filename: path,
        project_path: Rails.root.to_s,
        escape: true,
        escapefunc: "LiveComponent::Dynamics.h"
      ).src

      component_class.class_eval <<~RUBY, path, 0
        def render_dynamics
          #{src}
        end
      RUBY

      component_class.instance_variable_set(:@__lc_dynamics_capable, true)
    rescue StandardError => e
      Rails.logger&.warn("[LiveComponent::Dynamics] #{path}: #{e.class}: #{e.message}")
      nil
    end

    module ClassMethods
      def dynamics_capable?
        !!instance_variable_get(:@__lc_dynamics_capable)
      end
    end

    module TemplatePatch
      def compile_to_component
        result = super
        Dynamics.compile(@component, source, path.to_s) if path
        result
      end
    end
  end
end
