# frozen_string_literal: true

require "test_helper"
require "stringio"

class MiddlewareTest < TestCase
  def setup
    @app = ->(_env) { [404, {}, ["not found"]] }
    @middleware = LiveComponent::Middleware.new(@app)
  end

  def build_env(payload)
    encoded = LiveComponent::Payload.encode_response(payload.to_json, compress: true)
    body = { "payload" => encoded }.to_json

    {
      "PATH_INFO" => "/live_component/render",
      "rack.input" => StringIO.new(body),
    }
  end

  # The HTML path is the RESPONSE encoding `Payload.encode_response` produces
  # (base64, optionally gzipped) -- there's no `Payload.decode_response`, so
  # unwrap it the same way the JS client's decode_response() does.
  def decode_html(body)
    data = Base64.decode64(body)
    data.start_with?([0x1F, 0x8B].pack("C*")) ? Zlib.gunzip(data) : data
  end

  test "slots format with a dynamics-capable component returns the JSON envelope" do
    env = build_env(
      "format" => "slots",
      "state" => {
        "ruby_class" => "DynamicsCounterComponent",
        "props" => { "count" => 5 },
        "slots" => {},
        "children" => {},
      },
      "reflexes" => [{ "method_name" => "increment", "props" => {} }]
    )

    status, headers, body = @middleware.call(env)

    assert_equal 200, status
    assert_equal "application/json", headers["Content-Type"]

    envelope = JSON.parse(body.first)

    assert envelope["success"]
    assert_equal 6, envelope.dig("state", "props", "count")
    assert_equal 0, envelope.dig("dynamics", "occurrence")
  end

  test "slots format with a dynamics-incapable component falls back to html" do
    env = build_env(
      "format" => "slots",
      "state" => {
        "ruby_class" => "PlainCounterComponent",
        "props" => { "count" => 5 },
        "slots" => {},
        "children" => {},
      },
      "reflexes" => [{ "method_name" => "increment", "props" => {} }]
    )

    status, headers, body = @middleware.call(env)

    assert_equal 200, status
    assert_equal "text/html", headers["Content-Type"]

    html = decode_html(body.first)

    assert_includes html, "Count: <span>6</span>"
    refute html.end_with?("</live-component>\n")
  end

  test "a request without format falls back to the legacy render path" do
    env = build_env(
      "state" => {
        "ruby_class" => "PlainCounterComponent",
        "props" => { "count" => 5 },
        "slots" => {},
        "children" => {},
      },
      "reflexes" => []
    )

    status, headers, body = @middleware.call(env)

    assert_equal 200, status
    assert_equal "text/html", headers["Content-Type"]

    html = decode_html(body.first)

    assert_includes html, "Count: <span>5</span>"
    assert html.end_with?("</live-component>\n")
  end
end
